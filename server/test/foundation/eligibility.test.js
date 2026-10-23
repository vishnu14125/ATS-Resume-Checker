const { ingestPastedText } = require('../../src/documents/ingest');
const { parseResume } = require('../../src/engine/resume/parseResume');
const { parseJob } = require('../../src/engine/job/parseJob');
const { matchRequirements } = require('../../src/engine/matching/matchRequirements');
const { evaluateEligibility } = require('../../src/engine/evaluation/evaluate');
const { EvidenceSchema } = require('../../src/domain/contracts/evidence');
const { RequirementAssessmentSchema } = require('../../src/domain/contracts/match');
const { EligibilitySchema } = require('../../src/domain/contracts/eligibility');
const { makeId } = require('../../src/engine/text/ids');
const { REFERENCE_DATE } = require('./helpers/fixtures');

const resumeFrom = async (text) => {
  const doc = await ingestPastedText(text);
  return { doc, profile: parseResume(doc, { referenceDate: REFERENCE_DATE }) };
};
const jobFrom = async (text) => parseJob(await ingestPastedText(text));

/** Full pipeline from pasted text: parse → match (Phase 4) → evaluate (Phase 5). */
async function run(resumeText, jobText) {
  const { doc, profile } = await resumeFrom(resumeText);
  const job = await jobFrom(jobText);
  const assessments = matchRequirements(profile, job).assessments;
  const result = evaluateEligibility({ normalizedDocument: doc, resumeProfile: profile, jobProfile: job, assessments, referenceDate: REFERENCE_DATE });
  return { doc, profile, job, result };
}

/** Evaluate a resume against hand-built requirements (for types the fixtures can't easily trigger). */
function evaluateWith(doc, profile, requirements) {
  const job = { requirements };
  const assessments = matchRequirements(profile, job).assessments;
  return evaluateEligibility({ normalizedDocument: doc, resumeProfile: profile, jobProfile: job, assessments, referenceDate: REFERENCE_DATE });
}

function req(type, params, overrides = {}) {
  const key = overrides.canonicalKey || `${type}:${JSON.stringify(params)}`;
  return {
    id: makeId('req', key), type, canonicalKey: key,
    displayName: overrides.displayName || type, category: null,
    importance: overrides.importance || 'required',
    importanceReason: 'test', isHardConstraint: overrides.isHardConstraint ?? true,
    params, sourceStatementIds: ['stm_test'], sourceText: overrides.sourceText || type,
    extractedBy: 'rules', confidence: 0.9,
  };
}

const forType = (job, result, type) => {
  const r = job.requirements.find((x) => x.type === type);
  return result.assessments.find((a) => a.requirementId === r.id);
};
const findingFor = (result, requirementId) => result.eligibility.findings.find((f) => f.requirementId === requirementId);
const docText = (doc) => doc.lines.map((l) => l.original).join('\n');

const EXPERIENCED_RESUME = [
  'Jane Candidate', 'jane@example.com', '',
  'EXPERIENCE',
  'Software Engineer, Acme Corp', 'Jan 2021 - Present',
  '- Built services with Node.js and PostgreSQL.',
  '', 'SKILLS', 'React, Node.js, PostgreSQL, JavaScript',
].join('\n');

// ── Evidence ────────────────────────────────────────────────────────────────

describe('Evidence — grounding and no fabrication', () => {
  it('(1) explicit skill match carries verbatim evidence that exists in the resume', async () => {
    const { doc, result, job } = await run(EXPERIENCED_RESUME, 'Engineer\n\nRequired\n- React.');
    const a = result.assessments.find((x) => x.requirementId === job.requirements.find((r) => r.canonicalKey === 'skill:react').id);
    expect(a.status).toBe('met');
    const ev = result.evidence.find((e) => e.id === a.best.evidenceIds[0]);
    expect(ev).toBeDefined();
    expect(ev.skillIds).toContain('react');
    expect(docText(doc)).toContain(ev.snippet);
  });

  it('(3) related SQL evidence points at "PostgreSQL", never at an invented "SQL"', async () => {
    const { result, job } = await run(EXPERIENCED_RESUME, 'Engineer\n\nRequired\n- SQL.');
    const a = result.assessments.find((x) => x.requirementId === job.requirements.find((r) => r.canonicalKey === 'skill:sql').id);
    expect(a.status).toBe('partially_met');
    expect(a.best.relation).toEqual({ type: 'implies', from: 'postgresql', to: 'sql', weight: 0.9 });
    const ev = result.evidence.find((e) => e.id === a.best.evidenceIds[0]);
    expect(ev.skillIds).toEqual(['postgresql']);
    expect(ev.snippet.toLowerCase()).toContain('postgresql');
    expect(ev.snippet.toLowerCase()).not.toContain('sql experience');
  });

  it('(24,26) every referenced evidence id exists and every snippet is verbatim resume text', async () => {
    const { doc, result } = await run(EXPERIENCED_RESUME, [
      'Engineer', '', 'Required', '- React.', '- Node.js.', '- SQL.', '- 2+ years of experience.',
    ].join('\n'));
    const ids = new Set(result.evidence.map((e) => e.id));
    const referenced = [];
    for (const a of result.assessments) {
      if (a.best) referenced.push(...a.best.evidenceIds);
      a.alternatives.forEach((m) => referenced.push(...m.evidenceIds));
    }
    result.eligibility.findings.forEach((f) => referenced.push(...f.evidenceIds));
    for (const id of referenced) expect(ids.has(id)).toBe(true);
    const text = docText(doc);
    for (const e of result.evidence) {
      expect(EvidenceSchema.safeParse(e).success).toBe(true);
      expect(text).toContain(e.snippet);
    }
  });
});

// ── Skills: missing & forbidden do not become knockouts ──────────────────────

describe('Skills — missing and forbidden never fabricate a knockout', () => {
  it('(2) a missing required skill is "missing" with no evidence and no knockout', async () => {
    const { result, job } = await run(EXPERIENCED_RESUME, 'Engineer\n\nRequired\n- Kubernetes.');
    const a = result.assessments.find((x) => x.requirementId === job.requirements.find((r) => r.canonicalKey === 'skill:kubernetes').id);
    expect(a.status).toBe('missing');
    expect(a.best).toBeNull();
    expect(result.eligibility.findings.some((f) => f.kind === 'required_technology')).toBe(false);
    expect(result.eligibility.status).toBe('clear');
  });

  it('(4) JavaScript is never accepted as Java, and the miss creates no knockout', async () => {
    const { result, job } = await run('Dev\ndev@example.com\n\nSKILLS\nJavaScript', 'Engineer\n\nRequired\n- Java.');
    const a = result.assessments.find((x) => x.requirementId === job.requirements.find((r) => r.canonicalKey === 'skill:java').id);
    expect(a.status).toBe('missing');
    expect(a.statusReason).toMatch(/is not Java/);
    expect(result.eligibility.status).toBe('clear');
  });
});

// ── Experience ───────────────────────────────────────────────────────────────

describe('Experience — only explicit dates establish duration', () => {
  it('(5) explicit dates that cover the requirement → met', async () => {
    const { job, result } = await run(EXPERIENCED_RESUME, 'Engineer\n\nRequired\n- 3+ years of experience.');
    const a = forType(job, result, 'experience_years');
    expect(a.status).toBe('met');
    expect(a.details.kind).toBe('years');
    expect(a.details.demonstrated.bestMonths).toBeGreaterThanOrEqual(36);
    expect(a.best.evidenceIds.length).toBeGreaterThanOrEqual(1);
  });

  it('(6,20) too little dated experience → insufficient_evidence, not a failed knockout', async () => {
    const resume = ['Dev', 'd@e.com', '', 'EXPERIENCE', 'Engineer, Acme', 'Jan 2024 - Jun 2024', '- Built with React.'].join('\n');
    const { job, result } = await run(resume, 'Engineer\n\nRequired\n- 5+ years of experience.');
    const a = forType(job, result, 'experience_years');
    expect(a.status).toBe('insufficient_evidence');
    expect(a.credit).toBe(0);
    const f = findingFor(result, a.requirementId);
    expect(f.outcome).toBe('unknown');
    expect(f.outcome).not.toBe('failed');
    expect(result.eligibility.status).not.toBe('likely_filtered');
  });

  it('(21) overlapping employment is merged, not summed', async () => {
    const resume = [
      'Dev', 'd@e.com', '', 'EXPERIENCE',
      'Engineer, Acme', '2019 - 2023', '- Worked with Node.js.',
      'Consultant, Beta', '2021 - 2025', '- Worked with React.',
    ].join('\n');
    // Naive sum ≈ 10 years; true merged span 2019–2025 ≈ 7 years. Requiring 8 must fail to establish.
    const { job, result } = await run(resume, 'Engineer\n\nRequired\n- 8+ years of experience.');
    const a = forType(job, result, 'experience_years');
    expect(a.details.demonstrated.bestMonths).toBeLessThan(96); // < 8y despite summed 10y
    expect(a.details.demonstrated.bestMonths).toBeGreaterThanOrEqual(72); // ≈ 7y merged
    expect(a.status).toBe('insufficient_evidence');
  });

  it('(22) many projects do not establish years of experience', async () => {
    const resume = [
      'Dev', 'd@e.com', '', 'PROJECTS',
      'Project One', '- Built with React.', 'Project Two', '- Built with Node.js.',
      'Project Three', '- Built with PostgreSQL.', 'Project Four', '- Built with TypeScript.',
    ].join('\n');
    const { job, result } = await run(resume, 'Engineer\n\nRequired\n- 3+ years of experience.');
    const a = forType(job, result, 'experience_years');
    expect(a.details.demonstrated.bestMonths).toBe(0);
    expect(a.status).toBe('insufficient_evidence');
  });

  it('(23) a graduation date does not establish years of experience', async () => {
    const resume = ['Dev', 'd@e.com', '', 'EDUCATION', 'B.S. Computer Science, State University', '2018 - 2022'].join('\n');
    const { job, result } = await run(resume, 'Engineer\n\nRequired\n- 3+ years of experience.');
    const a = forType(job, result, 'experience_years');
    expect(a.details.demonstrated.bestMonths).toBe(0);
    expect(a.status).toBe('insufficient_evidence');
  });
});

// ── Education ─────────────────────────────────────────────────────────────────

describe('Education — inspect records, never guess', () => {
  it('(7) a matching degree at the required level and field → met', async () => {
    const resume = ['Dev', 'd@e.com', '', 'EDUCATION', "Bachelor's degree in Computer Science, State University", '2018 - 2022'].join('\n');
    const { job, result } = await run(resume, "Engineer\n\nRequired\n- Bachelor's degree in Computer Science.");
    const a = forType(job, result, 'education');
    expect(a.status).toBe('met');
    expect(a.details.levelMet).toBe(true);
    expect(a.details.fieldMatch).toBe('exact');
    expect(a.best.evidenceIds.length).toBe(1);
  });

  it('(8) no education on the resume → insufficient_evidence (not a failure)', async () => {
    const { job, result } = await run('Dev\nd@e.com\n\nSKILLS\nReact', "Engineer\n\nRequired\n- Bachelor's degree in Computer Science.");
    const a = forType(job, result, 'education');
    expect(a.status).toBe('insufficient_evidence');
    expect(a.credit).toBe(0);
    expect(findingFor(result, a.requirementId).outcome).toBe('unknown');
  });

  it('a degree in a different field, when related fields are not accepted, is partial', async () => {
    const resume = ['Dev', 'd@e.com', '', 'EDUCATION', "Bachelor's degree in Business Administration, State University", '2018 - 2022'].join('\n');
    const { doc, profile } = await resumeFrom(resume);
    const requirement = req('education', { kind: 'education', minLevel: 'bachelor', fieldIds: ['computer_science'], relatedFieldsAccepted: false, equivalentExperienceYears: null }, { displayName: "Bachelor's in Computer Science" });
    const result = evaluateWith(doc, profile, [requirement]);
    const a = result.assessments[0];
    expect(a.status).toBe('partially_met');
    expect(a.details.fieldMatch).toBe('none');
  });
});

// ── Certification ─────────────────────────────────────────────────────────────

describe('Certification — explicit only', () => {
  it('(9) a certification present in the resume → met', async () => {
    const resume = ['Dev', 'd@e.com', '', 'CERTIFICATIONS', 'AWS Certified Solutions Architect - Associate'].join('\n');
    const { doc, profile } = await resumeFrom(resume);
    const requirement = req('certification', { kind: 'certification', anyOf: ['aws-certified'], rawName: 'AWS Certified Solutions Architect' }, { displayName: 'AWS Certified Solutions Architect' });
    const result = evaluateWith(doc, profile, [requirement]);
    expect(result.assessments[0].status).toBe('met');
    expect(result.assessments[0].details.certStatus).toBeDefined();
  });

  it('(10) a certification absent from the resume → missing (never inferred from skills)', async () => {
    const resume = ['Dev', 'd@e.com', '', 'SKILLS', 'AWS, Kubernetes'].join('\n');
    const { doc, profile } = await resumeFrom(resume);
    const requirement = req('certification', { kind: 'certification', anyOf: ['cka'], rawName: 'Certified Kubernetes Administrator' }, { displayName: 'CKA' });
    const result = evaluateWith(doc, profile, [requirement]);
    expect(result.assessments[0].status).toBe('missing');
    expect(result.assessments[0].best).toBeNull();
  });
});

// ── Language ──────────────────────────────────────────────────────────────────

describe('Language — explicit statements only', () => {
  it('(11) a listed language with proficiency → met', async () => {
    const resume = ['Dev', 'd@e.com', '', 'LANGUAGES', 'English (native), Spanish (conversational)'].join('\n');
    const { job, result } = await run(resume, 'Engineer\n\nRequired\n- Fluency in Spanish is required.');
    const a = forType(job, result, 'language');
    expect(a.status).toBe('met');
    expect(a.best.evidenceIds.length).toBe(1);
  });

  it('(12) a required language not listed → insufficient_evidence (never inferred from resume language)', async () => {
    const resume = ['Dev', 'd@e.com', '', 'SKILLS', 'React'].join('\n');
    const { job, result } = await run(resume, 'Engineer\n\nRequired\n- Fluency in German is required.');
    const a = forType(job, result, 'language');
    expect(a.status).toBe('insufficient_evidence');
    expect(findingFor(result, a.requirementId).outcome).toBe('unknown');
  });
});

// ── Work authorization & clearance (sensitive) ────────────────────────────────

describe('Work authorization — explicit only, silence is unknown', () => {
  it('(13) an explicit authorization statement → met / passed', async () => {
    const resume = ['Dev', 'd@e.com', 'Authorized to work in the US.', '', 'SKILLS', 'React'].join('\n');
    const { job, result } = await run(resume, 'Engineer\n\nRequired\n- Must be authorized to work in the US.');
    const a = forType(job, result, 'work_authorization');
    expect(a.status).toBe('met');
    expect(findingFor(result, a.requirementId).outcome).toBe('passed');
  });

  it('(14) no authorization statement → insufficient_evidence and no knockout', async () => {
    const resume = ['Dev', 'd@e.com', '', 'SKILLS', 'React'].join('\n');
    const { job, result } = await run(resume, 'Engineer\n\nRequired\n- Must be authorized to work in the US.');
    const a = forType(job, result, 'work_authorization');
    expect(a.status).toBe('insufficient_evidence');
    const f = findingFor(result, a.requirementId);
    expect(f.outcome).toBe('unknown');
    expect(result.eligibility.status).toBe('review'); // critical + unknown → review, not filtered
    expect(result.eligibility.status).not.toBe('likely_filtered');
  });
});

describe('Clearance — the knockout boundary', () => {
  it('(15) an explicit active clearance → met / passed / clear', async () => {
    const resume = ['Dev', 'd@e.com', 'Active Secret clearance.', '', 'SKILLS', 'React'].join('\n');
    const { job, result } = await run(resume, 'Engineer\n\nRequired\n- Must have an active Secret security clearance.');
    const a = forType(job, result, 'clearance');
    expect(a.status).toBe('met');
    expect(findingFor(result, a.requirementId).outcome).toBe('passed');
    expect(result.eligibility.status).toBe('clear');
  });

  it('(16,19) an explicit denial → missing / failed / likely_filtered (a real knockout)', async () => {
    const resume = ['Dev', 'd@e.com', 'No security clearance.', '', 'SKILLS', 'React'].join('\n');
    const { job, result } = await run(resume, 'Engineer\n\nRequired\n- Must have an active Secret security clearance.');
    const a = forType(job, result, 'clearance');
    expect(a.status).toBe('missing');
    const f = findingFor(result, a.requirementId);
    expect(f.outcome).toBe('failed');
    expect(f.severity).toBe('critical');
    expect(f.evidenceIds.length).toBe(1);
    expect(result.eligibility.status).toBe('likely_filtered');
    expect(result.eligibility.reasons.length).toBeGreaterThan(0);
  });

  it('(17,20) no clearance mention → insufficient_evidence / unknown / review, never a knockout', async () => {
    const resume = ['Dev', 'd@e.com', '', 'SKILLS', 'React'].join('\n');
    const { job, result } = await run(resume, 'Engineer\n\nRequired\n- Must have an active Secret security clearance.');
    const a = forType(job, result, 'clearance');
    expect(a.status).toBe('insufficient_evidence');
    const f = findingFor(result, a.requirementId);
    expect(f.outcome).toBe('unknown');
    expect(result.eligibility.status).toBe('review');
    expect(result.eligibility.findings.some((x) => x.outcome === 'failed')).toBe(false);
  });
});

// ── Required vs preferred ─────────────────────────────────────────────────────

describe('Required vs preferred', () => {
  it('(18) a preferred hard-requirement shortfall never produces a knockout', async () => {
    const resume = ['Dev', 'd@e.com', 'No security clearance.', '', 'SKILLS', 'React'].join('\n');
    const { doc, profile } = await resumeFrom(resume);
    const preferredClearance = req('clearance', { kind: 'clearance', text: 'clearance preferred' }, { importance: 'preferred', isHardConstraint: false });
    const result = evaluateWith(doc, profile, [preferredClearance]);
    expect(result.assessments[0].status).toBe('missing');
    expect(result.eligibility.findings.length).toBe(0);
    expect(result.eligibility.status).toBe('clear');
  });
});

// ── Structural invariants ─────────────────────────────────────────────────────

describe('Structural invariants', () => {
  const FULL_RESUME = [
    'Jane Candidate', 'jane@example.com', '',
    'SUMMARY', 'Full-stack engineer. No security clearance.', '',
    'EXPERIENCE', 'Software Engineer, Acme Corp', 'Jan 2024 - Present', '- Built apps with React, Node.js and PostgreSQL.', '',
    'EDUCATION', 'B.S. in Computer Science, State University', '2018 - 2022', '',
    'CERTIFICATIONS', 'AWS Certified Developer - Associate', '',
    'SKILLS', 'React, Node.js, PostgreSQL, JavaScript', '',
    'LANGUAGES', 'English (native)',
  ].join('\n');
  const FULL_JD = [
    'Senior Software Engineer', '',
    'Required Qualifications',
    '- JavaScript is required.', '- React is required.', '- SQL is required.',
    '- 3+ years of professional experience is required.',
    "- Bachelor's degree in Computer Science is required.",
    '- Must have an active Secret security clearance.', '',
    'Preferred Qualifications', '- Node.js experience.', '- AWS certification.',
  ].join('\n');

  it('(25) every requirement receives exactly one contract-valid assessment', async () => {
    const { job, result } = await run(FULL_RESUME, FULL_JD);
    expect(result.assessments.length).toBe(job.requirements.length);
    const seen = new Set();
    for (const a of result.assessments) {
      expect(RequirementAssessmentSchema.safeParse(a).success).toBe(true);
      expect(job.requirements.some((r) => r.id === a.requirementId)).toBe(true);
      expect(seen.has(a.requirementId)).toBe(false);
      seen.add(a.requirementId);
    }
    expect(EligibilitySchema.safeParse(result.eligibility).success).toBe(true);
  });

  it('(realistic E2E) demonstrates the full matrix with an absent-vs-denied distinction', async () => {
    // ~2.75 years of dated experience (Jan 2024 → ref 2026-09) cannot establish the
    // required 3+ years, and the resume explicitly denies the clearance → knockout.
    const { job, result } = await run(FULL_RESUME, FULL_JD);
    const status = (type) => forType(job, result, type).status;
    const sqlStatus = result.assessments.find((a) => job.requirements.some((r) => r.id === a.requirementId && r.canonicalKey === 'skill:sql')).status;
    expect(status('experience_years')).toBe('insufficient_evidence'); // honest "cannot establish 3y", not a failure
    expect(findingFor(result, forType(job, result, 'experience_years').requirementId).outcome).toBe('unknown');
    expect(status('education')).toBe('met');
    expect(sqlStatus).toBe('partially_met'); // via PostgreSQL → SQL
    expect(status('clearance')).toBe('missing'); // explicit denial
    expect(result.eligibility.status).toBe('likely_filtered'); // driven solely by the clearance knockout
    expect(result.summary.knockouts).toBe(1);
  });

  it('(27) repeated execution is deterministic (deep-equal)', async () => {
    const first = await run(FULL_RESUME, FULL_JD);
    const second = await run(FULL_RESUME, FULL_JD);
    expect(first.result).toEqual(second.result);
  });
});
