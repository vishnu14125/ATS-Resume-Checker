const { ingestPastedText } = require('../../src/documents/ingest');
const { parseResume } = require('../../src/engine/resume/parseResume');
const { parseJob } = require('../../src/engine/job/parseJob');
const { matchRequirements } = require('../../src/engine/matching/matchRequirements');
const { matchSkillGroup, buildResumeSkillIndex } = require('../../src/engine/matching/matchSkills');
const { RequirementAssessmentSchema } = require('../../src/domain/contracts/match');
const { makeId } = require('../../src/engine/text/ids');
const { REFERENCE_DATE } = require('./helpers/fixtures');

const resumeFrom = async (text) => parseResume(await ingestPastedText(text), { referenceDate: REFERENCE_DATE });
const jobFrom = async (text) => parseJob(await ingestPastedText(text));

/** Finds the assessment for the requirement whose canonicalKey is `key`. */
function assessmentForKey(job, result, key) {
  const req = job.requirements.find((r) => r.canonicalKey === key);
  return result.assessments.find((a) => a.requirementId === req.id);
}

describe('Matching — Case 1: strong exact & alias matching', () => {
  it('canonicalizes JD aliases and matches all four skills', async () => {
    const resume = await resumeFrom('Dev\ndev@example.com\n\nSKILLS\nReact, TypeScript, Node.js, PostgreSQL');
    const job = await jobFrom('Engineer\n\nRequired\n- React.\n- TypeScript.\n- NodeJS.\n- Postgres.');
    const result = matchRequirements(resume, job);

    for (const key of ['skill:react', 'skill:typescript', 'skill:node.js', 'skill:postgresql']) {
      const a = assessmentForKey(job, result, key);
      expect(a.status).toBe('met');
      expect(a.credit).toBe(1);
      expect(a.best.matchedSkillId).toBe(key.split(':')[1]);
    }
    expect(result.summary.met).toBe(4);
  });
});

describe('Matching — Case 2: dangerous technology names are not falsely matched', () => {
  let resume; let job; let result;
  beforeAll(async () => {
    resume = await resumeFrom('Dev\ndev@example.com\n\nSKILLS\nJavaScript, React Native, C++');
    job = await jobFrom('Engineer\n\nRequired\n- Java.\n- React.\n- C#.');
    result = matchRequirements(resume, job);
  });

  it('does not match Java←JavaScript, React←React Native, or C#←C++', () => {
    for (const key of ['skill:java', 'skill:react', 'skill:c#']) {
      expect(assessmentForKey(job, result, key).status).toBe('missing');
    }
    expect(result.summary.met).toBe(0);
    expect(result.summary.partiallyMet).toBe(0);
  });

  it('explains the Java miss by naming the confusable sibling', () => {
    expect(assessmentForKey(job, result, 'skill:java').statusReason).toMatch(/is not Java/);
  });
});

describe('Matching — Case 3: skill group (anyOf)', () => {
  it('matches when at least one alternative is present', async () => {
    const resume = await resumeFrom('Dev\ndev@example.com\n\nSKILLS\nVue, HTML, CSS');
    const index = buildResumeSkillIndex(resume);
    const group = matchSkillGroup(['react', 'vue', 'angular'], index);
    expect(group.status).toBe('met');
    expect(group.best.matchedSkillId).toBe('vue');
  });

  it('is routed by the orchestrator and produces a contract-valid assessment', async () => {
    const resume = await resumeFrom('Dev\ndev@example.com\n\nSKILLS\nVue');
    const req = {
      id: makeId('req', 'group:frontend'), type: 'skill_group', canonicalKey: 'group:react|vue|angular',
      displayName: 'React, Vue or Angular', category: 'frontend', importance: 'required',
      importanceReason: 'Required section', isHardConstraint: true,
      params: { kind: 'skill_group', anyOf: ['react', 'vue', 'angular'], minCount: 1, label: null, categoryId: null },
      sourceStatementIds: ['stm_x'], sourceText: 'React, Vue or Angular', extractedBy: 'rules', confidence: 0.9,
    };
    const result = matchRequirements(resume, { requirements: [req] });
    expect(result.assessments[0].status).toBe('met');
    expect(result.assessments[0].best.matchedSkillId).toBe('vue');
    expect(RequirementAssessmentSchema.safeParse(result.assessments[0]).success).toBe(true);
  });

  it('is missing when no alternative is present', async () => {
    const resume = await resumeFrom('Dev\ndev@example.com\n\nSKILLS\nPython, Django');
    const group = matchSkillGroup(['react', 'vue', 'angular'], buildResumeSkillIndex(resume));
    expect(group.status).toBe('missing');
  });
});

describe('Matching — Case 4: missing skill', () => {
  it('reports Kubernetes missing when the resume only has Docker', async () => {
    const resume = await resumeFrom('Dev\ndev@example.com\n\nSKILLS\nDocker');
    const job = await jobFrom('Engineer\n\nRequired\n- Kubernetes.');
    const result = matchRequirements(resume, job);
    const a = assessmentForKey(job, result, 'skill:kubernetes');
    expect(a.status).toBe('missing');
    expect(a.best).toBeNull();
    expect(a.credit).toBe(0);
  });
});

describe('Matching — Case 5: related skill (implication, not equality)', () => {
  it('marks SQL as partially_met via PostgreSQL, never as an exact match', async () => {
    const resume = await resumeFrom('Dev\ndev@example.com\n\nSKILLS\nPostgreSQL');
    const job = await jobFrom('Engineer\n\nRequired\n- SQL.');
    const result = matchRequirements(resume, job);
    const a = assessmentForKey(job, result, 'skill:sql');
    expect(a.status).toBe('partially_met');
    expect(a.status).not.toBe('met');
    expect(a.best.method).toBe('implied');
    expect(a.best.relation).toEqual({ type: 'implies', from: 'postgresql', to: 'sql', weight: 0.9 });
    expect(a.credit).toBe(0.9);
  });
});

describe('Matching — Case 6: non-skill requirements are not treated as skills', () => {
  it('reports experience, education and certification requirements as not_evaluated', async () => {
    const resume = await resumeFrom('Dev\ndev@example.com\n\nSKILLS\nPython');
    const job = await jobFrom([
      'Engineer', '', 'Required Qualifications',
      '- 3+ years of experience.',
      "- Bachelor's degree in Computer Science.",
      '- AWS Certified Developer certification.',
    ].join('\n'));
    const result = matchRequirements(resume, job);

    for (const type of ['experience_years', 'education', 'certification']) {
      const req = job.requirements.find((r) => r.type === type);
      expect(req).toBeDefined();
      const a = result.assessments.find((x) => x.requirementId === req.id);
      expect(a.status).toBe('not_evaluated');
      expect(a.credit).toBe(0);
      expect(a.best).toBeNull();
    }
  });
});

describe('Matching — explainability, provenance and determinism', () => {
  it('every assessment is contract-valid and every match carries an evidence reference and reason', async () => {
    const resume = await resumeFrom('Dev\ndev@example.com\n\nEXPERIENCE\nEngineer, Acme\n2021 - Present\n- Built services with Node.js.');
    const job = await jobFrom('Engineer\n\nRequired\n- NodeJS.');
    const result = matchRequirements(resume, job);
    const a = assessmentForKey(job, result, 'skill:node.js');
    expect(RequirementAssessmentSchema.safeParse(a).success).toBe(true);
    expect(a.best.evidenceIds[0]).toMatch(/^ev_[a-f0-9]+$/);
    expect(a.best.explanation).toMatch(/alias|canonical/i);
    expect(a.best.strength).toBe('strong'); // found in experience
  });

  it('is deterministic (same inputs → deep-equal output)', async () => {
    const resume = await resumeFrom('Dev\ndev@example.com\n\nSKILLS\nReact, Node.js, PostgreSQL');
    const job = await jobFrom('Engineer\n\nRequired\n- React.\n- Node.js.\n- SQL.');
    const first = matchRequirements(resume, job);
    const second = matchRequirements(resume, job);
    expect(first).toEqual(second);
  });

  it('includes the taxonomy and matcher versions for reproducibility', async () => {
    const resume = await resumeFrom('Dev\ndev@example.com\n\nSKILLS\nReact');
    const job = await jobFrom('Engineer\n\nRequired\n- React.');
    const result = matchRequirements(resume, job);
    expect(result.taxonomyVersion).toBe('2026.1');
    expect(result.matcherVersion).toMatch(/phase4/);
  });
});
