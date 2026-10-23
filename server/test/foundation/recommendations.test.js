const { ingestPastedText } = require('../../src/documents/ingest');
const { parseResume } = require('../../src/engine/resume/parseResume');
const { parseJob } = require('../../src/engine/job/parseJob');
const { matchRequirements } = require('../../src/engine/matching/matchRequirements');
const { evaluateEligibility } = require('../../src/engine/evaluation/evaluate');
const { scoreJobMatch } = require('../../src/engine/scoring/jobMatch');
const { assessResumeHealth } = require('../../src/engine/scoring/resumeHealth');
const { buildRecommendations } = require('../../src/engine/recommendations/recommend');
const { RecommendationSchema } = require('../../src/domain/contracts/recommendation');
const { REFERENCE_DATE } = require('./helpers/fixtures');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Runs the real Phase 2–6 pipeline and returns everything the recommendation engine consumes. */
async function analyze(resumeText, jobText = null, { mutateDoc } = {}) {
  const doc = await ingestPastedText(resumeText);
  const profile = parseResume(doc, { referenceDate: REFERENCE_DATE });
  const healthDoc = mutateDoc ? mutateDoc(JSON.parse(JSON.stringify(doc))) : doc;
  const resumeHealth = assessResumeHealth({ normalizedDocument: healthDoc, resumeProfile: profile });
  if (jobText === null) return { resumeHealth, jobMatch: null, evidence: [] };

  const job = parseJob(await ingestPastedText(jobText));
  const evaluated = evaluateEligibility({
    normalizedDocument: doc, resumeProfile: profile, jobProfile: job,
    assessments: matchRequirements(profile, job).assessments, referenceDate: REFERENCE_DATE,
  });
  const { score } = scoreJobMatch({ jobProfile: job, assessments: evaluated.assessments, eligibility: evaluated.eligibility });
  return {
    resumeHealth,
    jobMatch: { requirements: job.requirements, assessments: evaluated.assessments, eligibility: evaluated.eligibility, score },
    evidence: evaluated.evidence,
  };
}

const recommend = async (...args) => {
  const input = await analyze(...args);
  return { input, recs: buildRecommendations(input).recommendations };
};
const byRule = (recs, ruleId) => recs.filter((r) => r.ruleId === ruleId);
const jobRecs = (recs) => recs.filter((r) => r.scope === 'job');
const forRequirement = (input, recs, canonicalKey) => {
  const req = input.jobMatch.requirements.find((r) => r.canonicalKey === canonicalKey);
  return recs.find((r) => r.requirementIds.includes(req.id));
};
const allText = (recs) => recs.map((r) => `${r.issue} ${r.action} ${r.rationale} ${r.integrityNote || ''}`).join('\n');
const RANK = { critical: 0, high: 1, medium: 2, low: 3 };

const STRONG_RESUME = [
  'Jane Candidate', 'jane@example.com | +1 555 010 2000', '',
  'EXPERIENCE',
  'Software Engineer, Acme Corp', 'Jan 2022 - Present',
  '- Built customer-facing web applications with React, TypeScript and Node.js, improving page load time by 30%.',
  '- Designed PostgreSQL schemas and REST APIs serving more than 10,000 daily users.',
  '- Automated deployments with Docker and GitHub Actions, reducing release time from hours to minutes.',
  'Junior Developer, Beta Labs', 'Jun 2020 - Dec 2021',
  '- Developed internal dashboards in JavaScript and Python used by the operations team.',
  '- Wrote unit and integration tests with Jest, raising coverage to 85%.', '',
  'EDUCATION', 'B.S. in Computer Science, State University', '2016 - 2020', '',
  'SKILLS', 'JavaScript, TypeScript, React, Node.js, PostgreSQL, Python, Docker, Git, Jest',
].join('\n');

const WEAK_RESUME = [
  'Office Assistant, Local Company',
  '- Responsible for answering telephone calls and greeting visitors at the front desk each day.',
  '- Responsible for organising paper files and scheduling meetings for the management team.',
  '- Duties included ordering stationery supplies and keeping the reception area tidy for guests.',
].join('\n');

// Two years of dated experience, PostgreSQL but not SQL, Git only in the skills list, no AWS.
const JUNIOR_RESUME = [
  'Jane Candidate', 'jane@example.com | +1 555 010 2000', '',
  'EXPERIENCE', 'Software Engineer, Acme Corp', 'Sep 2024 - Present',
  '- Built web apps with React, Node.js and PostgreSQL, improving load time by 30%.',
  '- Developed REST APIs in JavaScript serving 10k users.', '',
  'EDUCATION', 'B.S. in Computer Science, State University', '2018 - 2022', '',
  'SKILLS', 'React, Node.js, PostgreSQL, JavaScript, HTML, CSS, Git, Docker',
].join('\n');

const JD = [
  'Software Engineer', '', 'Required Qualifications',
  '- JavaScript is required.', '- React is required.', '- SQL is required.', '- Git is required.', '- Kubernetes is required.',
  '- 3+ years of professional experience is required.', '', 'Preferred Qualifications', '- AWS.',
].join('\n');

// ── Resume-only ──────────────────────────────────────────────────────────────

describe('Resume-only recommendations', () => {
  it('(1,3,31) a weak resume gets actionable resume-scope recommendations and nothing job-specific', async () => {
    const { recs } = await recommend(WEAK_RESUME);
    expect(recs.length).toBeGreaterThanOrEqual(4);
    expect(recs.every((r) => r.scope === 'resume' && r.requirementIds.length === 0)).toBe(true);
    expect(recs.some((r) => r.priority === 'high')).toBe(true);
    expect(allText(recs)).not.toMatch(/job description|required by|employer requires/i);
  });

  it('(30,25) a strong resume gets no high-priority advice and none about optional sections', async () => {
    const { recs } = await recommend(STRONG_RESUME);
    expect(recs.some((r) => RANK[r.priority] <= RANK.high)).toBe(false);
    expect(allText(recs)).not.toMatch(/summary|certification|linkedin|github|portfolio/i);
  });

  it('(24) never suggests a specific technology the resume does not contain', async () => {
    const { recs } = await recommend(WEAK_RESUME);
    expect(allText(recs)).not.toMatch(/\b(AWS|Kubernetes|React|Python|Docker|Java)\b/);
  });

  it('(9) parseability findings produce parseability recommendations', async () => {
    const { recs } = await recommend(STRONG_RESUME, null, {
      mutateDoc: (doc) => {
        doc.layout.multiColumnSuspected = true;
        doc.stats.replacementCharCount = Math.ceil(doc.stats.charCount * 0.05);
        doc.stats.privateUseCharCount = 4;
        return doc;
      },
    });
    const characters = byRule(recs, 'REC-PARSE-CHARACTERS')[0];
    expect(characters.category).toBe('parseability');
    expect(characters.findingIds.length).toBe(2); // encoding + icon glyphs collapse into one
    expect(byRule(recs, 'REC-PARSE-LAYOUT').length).toBe(1);
  });

  it('an unreadable resume yields only the extraction recommendation', async () => {
    const { recs } = await recommend('Jane Candidate\njane@example.com');
    expect(recs.map((r) => r.ruleId)).toEqual(['REC-PARSE-TEXT']);
    expect(recs[0].priority).toBe('high');
    expect(recs[0].expectedImpact.scoreDelta).toBeNull();
  });

  it('(10) structure findings produce a structure recommendation', async () => {
    const { recs } = await recommend(WEAK_RESUME.replace('Office Assistant, Local Company', 'EXPERIENCE\nOffice Assistant, Local Company'));
    const rec = byRule(recs, 'REC-STRUCT-ROLE-HEADINGS')[0];
    expect(rec.category).toBe('format');
    expect(rec.issue).toMatch(/0 of 1 experience entries have parseable dates/);
  });

  it('(11) technical-content findings produce a technical-content recommendation', async () => {
    const { recs } = await recommend(WEAK_RESUME);
    const rec = byRule(recs, 'REC-TECH-NAME-SKILLS')[0];
    expect(rec.category).toBe('technical_content');
    expect(rec.issue).toMatch(/0 distinct recognised skills/);
    expect(rec.integrityNote).toMatch(/only technologies you have actually used/i);
  });

  it('(12,23) impact recommendations ask for verifiable results and never supply a number', async () => {
    const resume = STRONG_RESUME.replace(/, improving page load time by 30%|serving more than 10,000 daily users|, reducing release time from hours to minutes|, raising coverage to 85%/g, '');
    const { recs } = await recommend(resume);
    const rec = byRule(recs, 'REC-IMPACT-QUANTIFY')[0];
    expect(rec.category).toBe('content_quality');
    expect(rec.action).toMatch(/Where you can verify the result/);
    expect(rec.action).not.toMatch(/\d/);
    expect(rec.integrityNote).toMatch(/Do not estimate or invent numbers/);
  });

  it('(13,32) missing contact details collapse into one high-priority completeness recommendation', async () => {
    const { recs } = await recommend(WEAK_RESUME);
    const contact = byRule(recs, 'REC-COMP-CONTACT');
    expect(contact.length).toBe(1);
    expect(contact[0].priority).toBe('high');
    expect(contact[0].findingIds.length).toBeGreaterThanOrEqual(2); // email + phone (+ name)
    expect(contact[0].issue).toMatch(/No email address was found/);
  });

  it('(26) a resume with no findings yields an empty result', () => {
    const resumeHealth = { checks: [], findings: [], score: { score: 100, deductions: [] } };
    expect(buildRecommendations({ resumeHealth }).recommendations).toEqual([]);
  });
});

// ── Job-specific ─────────────────────────────────────────────────────────────

describe('Job-specific recommendations', () => {
  let input; let recs;
  beforeAll(async () => { ({ input, recs } = await recommend(JUNIOR_RESUME, JD)); });

  it('(2) adds job-scope recommendations when a JD is supplied', () => {
    expect(jobRecs(recs).length).toBeGreaterThan(0);
  });

  it('(4,22) a required missing skill is a high-priority gap that never says "add it"', () => {
    const rec = forRequirement(input, recs, 'skill:kubernetes');
    expect(rec.ruleId).toBe('REC-SKILL-MISSING');
    expect(rec.priority).toBe('high');
    expect(rec.issue).toMatch(/Kubernetes is a required skill.*no supporting evidence/);
    expect(rec.action).toMatch(/^If you have genuine Kubernetes experience/);
    expect(rec.action).toMatch(/If you do not, leave it out/);
    expect(rec.integrityNote).toMatch(/Only add Kubernetes if it truthfully reflects/);
    expect(rec.evidenceIds).toEqual([]);
  });

  it('(5,16) a required partial skill cites the related evidence that actually exists', () => {
    const rec = forRequirement(input, recs, 'skill:sql');
    expect(rec.ruleId).toBe('REC-SKILL-RELATED-ONLY');
    expect(rec.priority).toBe('medium');
    expect(rec.issue).toMatch(/shows PostgreSQL, which is related/);
    const cited = input.evidence.find((e) => e.id === rec.evidenceIds[0]);
    expect(cited.snippet).toMatch(/PostgreSQL/);
  });

  it('a matched but only-listed skill gets a presentation recommendation, not a gap', () => {
    const rec = forRequirement(input, recs, 'skill:git');
    expect(rec.ruleId).toBe('REC-SKILL-WEAK-EVIDENCE');
    expect(rec.issue).toMatch(/is matched, but the resume only lists it/);
    expect(rec.evidenceIds.length).toBe(1);
  });

  it('(6) a preferred missing skill is low priority and described as optional', () => {
    const rec = forRequirement(input, recs, 'skill:aws');
    expect(rec.priority).toBe('low');
    expect(rec.issue).toMatch(/AWS is a preferred skill/);
    expect(rec.rationale).toMatch(/not mandatory/);
  });

  it('(7) an experience shortfall reports the dated evidence and its score impact', () => {
    const rec = forRequirement(input, recs, 'years:general');
    expect(rec.ruleId).toBe('REC-EXPERIENCE-EVIDENCE');
    expect(rec.priority).toBe('high');
    expect(rec.issue).toMatch(/dated roles establish about 2\.\d years/);
    expect(rec.integrityNote).toMatch(/Do not extend dates/);
    const deduction = input.jobMatch.score.deductions.find((d) => d.subjectId === rec.requirementIds[0]);
    expect(rec.expectedImpact).toMatchObject({ scoreKind: 'job_match', scoreDelta: Math.round(deduction.pointsLost * 10) / 10 });
  });

  it('(25) makes no recommendation for requirements that are fully met', () => {
    expect(forRequirement(input, recs, 'skill:react')).toBeUndefined();
    expect(forRequirement(input, recs, 'skill:javascript')).toBeUndefined();
  });

  it('(19) each requirement produces at most one recommendation, even when duplicated', () => {
    const duplicated = { ...input, jobMatch: { ...input.jobMatch, requirements: [...input.jobMatch.requirements, ...input.jobMatch.requirements] } };
    const again = buildRecommendations(duplicated).recommendations;
    expect(again).toEqual(recs);
    const perRequirement = jobRecs(recs).map((r) => r.requirementIds[0]);
    expect(new Set(perRequirement).size).toBe(perRequirement.length);
  });

  it('(21) orders by priority, with required gaps ahead of preferred ones', () => {
    const ranks = recs.map((r) => RANK[r.priority]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    const index = (key) => recs.indexOf(forRequirement(input, recs, key));
    expect(index('skill:kubernetes')).toBeLessThan(index('years:general')); // missing before insufficiently evidenced
    expect(index('years:general')).toBeLessThan(index('skill:sql'));
    expect(index('skill:sql')).toBeLessThan(index('skill:aws'));
  });

  it('(8) required education with no degree information is an evidence gap, not a failure', async () => {
    const r = await recommend(JUNIOR_RESUME.replace(/EDUCATION\n.*\n.*\n\n/, ''), "Engineer\n\nRequired Qualifications\n- Bachelor's degree in Computer Science is required.");
    const rec = byRule(r.recs, 'REC-EDUCATION-EVIDENCE')[0];
    expect(rec.priority).toBe('high');
    expect(rec.action).toMatch(/^If you hold this qualification/);
  });

  it('(27) all requirements met → no job recommendations', async () => {
    const r = await recommend(STRONG_RESUME, 'Engineer\n\nRequired Qualifications\n- React is required.\n- Node.js is required.\n- 3+ years of experience is required.');
    expect(jobRecs(r.recs)).toEqual([]);
  });

  it('(28) all requirements missing → one high-priority gap per requirement', async () => {
    const r = await recommend(STRONG_RESUME, 'Engineer\n\nRequired Qualifications\n- Rust is required.\n- Kubernetes is required.\n- Kafka is required.');
    const job = jobRecs(r.recs);
    expect(job.length).toBe(3);
    expect(job.every((x) => x.ruleId === 'REC-SKILL-MISSING' && x.priority === 'high')).toBe(true);
  });

  it('(29) a preferred-only JD never produces a recommendation above low priority', async () => {
    const r = await recommend(STRONG_RESUME, 'Engineer\n\nPreferred Qualifications\n- Rust.\n- Kubernetes.\n- React.');
    const job = jobRecs(r.recs);
    expect(job.length).toBe(2);
    expect(job.every((x) => x.priority === 'low')).toBe(true);
  });
});

// ── Eligibility ──────────────────────────────────────────────────────────────

describe('Eligibility recommendations', () => {
  const CLEARANCE_JD = 'Engineer\n\nRequired Qualifications\n- React is required.\n- Must have an active Secret security clearance.';

  it('(14) a critical knockout is the first recommendation and is not "fixed" by rewording', async () => {
    const { input, recs } = await recommend(JUNIOR_RESUME.replace('SKILLS', 'No security clearance.\n\nSKILLS'), CLEARANCE_JD);
    const [first] = recs;
    expect(first.ruleId).toBe('REC-ELIGIBILITY-KNOCKOUT');
    expect(first.priority).toBe('critical');
    expect(first.action).toMatch(/Rewording the resume cannot resolve an eligibility requirement/);
    expect(first.findingIds).toEqual([input.jobMatch.eligibility.findings.find((f) => f.outcome === 'failed').id]);
    expect(input.evidence.find((e) => e.id === first.evidenceIds[0]).snippet).toMatch(/No security clearance/);
    expect(first.expectedImpact.scoreDelta).toBeNull();
  });

  it('(15) unknown eligibility is described as unconfirmed, never as a failure', async () => {
    const { recs } = await recommend(JUNIOR_RESUME, CLEARANCE_JD);
    const rec = byRule(recs, 'REC-ELIGIBILITY-UNCONFIRMED')[0];
    expect(rec.priority).toBe('high');
    expect(rec.issue).toMatch(/could not be confirmed\. This is not a failure\./);
    expect(rec.action).toMatch(/^Verify your eligibility/);
    expect(recs.some((r) => r.priority === 'critical')).toBe(false);
  });
});

// ── Grounding, contract, determinism ─────────────────────────────────────────

describe('Grounding, validation and determinism', () => {
  it('(16,17,33) every recommendation is contract-valid and cites only ids that exist', async () => {
    const { input, recs } = await recommend(WEAK_RESUME.replace('Office', 'No security clearance.\nOffice'), `${JD}\n- Must have an active Secret security clearance.`);
    const requirementIds = new Set(input.jobMatch.requirements.map((r) => r.id));
    const evidenceIds = new Set(input.evidence.map((e) => e.id));
    const findingIds = new Set([...input.resumeHealth.checks, ...input.resumeHealth.findings, ...input.jobMatch.eligibility.findings].map((x) => x.id));
    expect(recs.length).toBeGreaterThan(8);
    for (const r of recs) {
      expect(RecommendationSchema.safeParse(r).success).toBe(true);
      expect(r.requirementIds.length + r.findingIds.length).toBeGreaterThan(0);
      r.requirementIds.forEach((id) => expect(requirementIds.has(id)).toBe(true));
      r.evidenceIds.forEach((id) => expect(evidenceIds.has(id)).toBe(true));
      r.findingIds.forEach((id) => expect(findingIds.has(id)).toBe(true));
    }
  });

  it('(22) every action that asks the user to add or state something carries an integrity note', async () => {
    const { recs } = await recommend(WEAK_RESUME, JD);
    for (const r of recs.filter((x) => /\b(add|state|name|list|mention)\b/i.test(x.action) && x.category !== 'parseability')) {
      expect(r.integrityNote).not.toBeNull();
    }
    expect(jobRecs(recs).every((r) => !/^Add\b/.test(r.action))).toBe(true);
  });

  it('(18) rejects a recommendation that would cite nonexistent evidence, requirements or findings', async () => {
    const input = await analyze(JUNIOR_RESUME, JD);
    expect(() => buildRecommendations({ ...input, evidence: [] })).toThrow(/unknown evidence/);

    const orphanRequirement = { ...input, jobMatch: { ...input.jobMatch } };
    const { assertGrounded } = require('../../src/engine/recommendations/recommend');
    const [rec] = buildRecommendations(input).recommendations;
    expect(() => assertGrounded([{ ...rec, requirementIds: ['req_ghost'] }], orphanRequirement)).toThrow(/unknown requirement/);
    expect(() => assertGrounded([{ ...rec, findingIds: ['fnd_ghost'] }], input)).toThrow(/unknown finding/);
    expect(() => assertGrounded([{ ...rec, requirementIds: [], findingIds: [] }], input)).toThrow(/no source/);
  });

  it('(20,34) repeated execution produces identical, identically ordered output', async () => {
    const first = await recommend(WEAK_RESUME, JD);
    const second = await recommend(WEAK_RESUME, JD);
    expect(second.recs).toEqual(first.recs);
    expect(buildRecommendations(first.input)).toEqual(buildRecommendations(first.input));
  });
});
