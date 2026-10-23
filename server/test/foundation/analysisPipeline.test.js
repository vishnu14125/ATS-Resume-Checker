const { createAnalysisRunner, DEFAULT_PIPELINE, RESUME_TEXT_MAX_CHARS } = require('../../src/application/analysis/runAnalysis');
const { AnalysisResultSchema, JOB_TEXT_MAX_CHARS } = require('../../src/domain/contracts/analysis');
const { AppError } = require('../../src/shared/errors');
const { readResumeBuffer, readResumeText, readJdBuffer, readJdText, REFERENCE_DATE } = require('./helpers/fixtures');

const now = () => new Date('2026-09-29T15:45:00Z');
const run = createAnalysisRunner({ now });

const file = (buffer, filename) => ({ file: { buffer, filename } });
const RESUME = readResumeText('software_developer.txt');
const JD = readJdText('backend_developer.txt');
const withoutTimings = (result) => ({ ...result, diagnostics: { ...result.diagnostics, timingsMs: {} } });

describe('Canonical analysis — resume only', () => {
  let result; let record;
  beforeAll(async () => { ({ result, record } = await run({ resume: { text: RESUME } })); });

  it('produces a contract-valid resume_only result with health and recommendations', () => {
    expect(AnalysisResultSchema.safeParse(result).success).toBe(true);
    expect(result.mode).toBe('resume_only');
    expect(result.resumeHealth.score.kind).toBe('resume_health');
    expect(result.resumeHealth.score.score).toBeGreaterThan(80);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('has no job, no Job Match Score and no job-scoped recommendations', () => {
    expect(result.job).toBeNull();
    expect(result.jobMatch).toBeNull();
    expect(result.engine.jobParserVersion).toBeNull();
    expect(result.recommendations.every((r) => r.scope === 'resume' && r.requirementIds.length === 0)).toBe(true);
    expect(record.mode).toBe('resume_only');
    expect(record.job).toBeNull();
    expect(record.summary.jobMatch).toBeNull();
    expect(record.versions).toMatchObject({ jobParser: null, matcher: null, evaluator: null });
  });

  it('records the reference date as a calendar day and identifies the resume by content hash', () => {
    expect(result.referenceDate).toBe('2026-09-29');
    expect(result.resume).toEqual({ resumeVersionId: null, resumeTextHash: record.resume.textHash });
    expect(record.resume).toMatchObject({ kind: 'paste', fileName: null, sizeBytes: null });
  });
});

describe('Canonical analysis — resume + job description', () => {
  let result; let record;
  beforeAll(async () => {
    ({ result, record } = await run({
      resume: file(readResumeBuffer('software_developer.txt'), 'C:\\Users\\me\\software_developer.txt'),
      job: file(readJdBuffer('backend_developer.docx'), 'backend_developer.docx'),
    }));
  });

  it('produces a contract-valid job_match result', () => {
    expect(AnalysisResultSchema.safeParse(result).success).toBe(true);
    expect(result.mode).toBe('job_match');
    expect(result.job).toEqual({ jobId: null, jobTextHash: record.job.textHash, jobProfileRevision: 1 });
  });

  it('contains Job Match, assessments, evidence, eligibility and recommendations', () => {
    const { jobMatch } = result;
    expect(jobMatch.score.kind).toBe('job_match');
    expect(typeof jobMatch.score.score).toBe('number');
    expect(jobMatch.requirements.length).toBeGreaterThan(3);
    expect(jobMatch.assessments.length).toBe(jobMatch.requirements.length);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(['clear', 'review', 'likely_filtered']).toContain(jobMatch.eligibility.status);
    expect(result.recommendations.some((r) => r.scope === 'job')).toBe(true);
    expect(result.resumeHealth.score.score).toBeGreaterThan(80); // health is still reported with a job
  });

  it('keeps every cross-reference valid (requirements, evidence, recommendations, knockouts)', () => {
    const requirementIds = new Set(result.jobMatch.requirements.map((r) => r.id));
    const evidenceIds = new Set(result.evidence.map((e) => e.id));
    const findingIds = new Set([...result.resumeHealth.checks, ...result.resumeHealth.findings, ...result.jobMatch.eligibility.findings].map((x) => x.id));
    for (const a of result.jobMatch.assessments) {
      expect(requirementIds.has(a.requirementId)).toBe(true);
      if (a.best) a.best.evidenceIds.forEach((id) => expect(evidenceIds.has(id)).toBe(true));
    }
    for (const r of result.recommendations) {
      r.requirementIds.forEach((id) => expect(requirementIds.has(id)).toBe(true));
      r.evidenceIds.forEach((id) => expect(evidenceIds.has(id)).toBe(true));
      r.findingIds.forEach((id) => expect(findingIds.has(id)).toBe(true));
    }
    result.jobMatch.score.components.forEach((c) => c.items.forEach((i) => expect(requirementIds.has(i.subjectId)).toBe(true)));
  });

  it('describes both documents without paths, and records every engine version', () => {
    expect(record.resume).toMatchObject({ kind: 'txt', fileName: 'software_developer.txt' });
    expect(record.job).toMatchObject({ kind: 'docx', fileName: 'backend_developer.docx', company: 'DataForge' });
    expect(record.versions).toEqual({
      schema: '1', engine: result.engine.version, parser: result.engine.parserVersion, jobParser: result.engine.jobParserVersion,
      taxonomy: '2026.1', matcher: expect.stringMatching(/phase4/), evaluator: expect.stringMatching(/phase5/),
      scoringModel: result.engine.scoringModelVersion, recommendations: result.engine.recommendationsVersion,
    });
    expect(record.summary.jobMatch.score).toBe(result.jobMatch.score.score);
  });
});

describe('Knockout stays separate from the score', () => {
  const resume = `${RESUME}\nNo security clearance.`;
  const jd = `${JD}\n- Must have an active Secret security clearance.`;

  it('reports a hard knockout beside an uncapped, unchanged Job Match Score', async () => {
    const knockedOut = await run({ resume: { text: resume }, job: { text: jd } });
    const noClearanceRequirement = await run({ resume: { text: resume }, job: { text: JD } });

    expect(knockedOut.result.jobMatch.eligibility.status).toBe('likely_filtered');
    expect(knockedOut.record.summary.jobMatch).toMatchObject({ eligibility: 'likely_filtered', hardKnockout: true });
    expect(knockedOut.result.recommendations[0]).toMatchObject({ ruleId: 'REC-ELIGIBILITY-KNOCKOUT', priority: 'critical' });

    const { score } = knockedOut.result.jobMatch;
    expect(score.score).toBe(noClearanceRequirement.result.jobMatch.score.score); // the knockout costs no points
    expect(score.score).toBeGreaterThan(40); // and applies no cap
    const contributions = score.components.reduce((sum, c) => sum + c.contribution, 0);
    expect(Math.abs(contributions - score.score)).toBeLessThan(0.15); // arithmetic is untouched
  });

  it('an unstated clearance is "review", not a knockout', async () => {
    const { result, record } = await run({ resume: { text: RESUME }, job: { text: jd } });
    expect(result.jobMatch.eligibility.status).toBe('review');
    expect(record.summary.jobMatch.hardKnockout).toBe(false);
  });
});

describe('Determinism, single-pass execution and independence from AI', () => {
  it('is deterministic for the same inputs and reference date', async () => {
    const input = { resume: { text: RESUME }, job: { text: JD } };
    const first = await run(input);
    const second = await run(input);
    expect(withoutTimings(second.result)).toEqual(withoutTimings(first.result));
    expect(second.record).toEqual(first.record);

    const fixedClock = createAnalysisRunner({ now, elapsedMs: () => 0 });
    expect(await fixedClock(input)).toEqual(await fixedClock(input)); // identical including diagnostics
  });

  it('gives the same analysis for a document whether uploaded or pasted', async () => {
    const pasted = await run({ resume: { text: RESUME } });
    const uploaded = await run({ resume: file(readResumeBuffer('software_developer.txt'), 'cv.txt') });
    expect(uploaded.result.resume.resumeTextHash).toBe(pasted.result.resume.resumeTextHash);
    expect(uploaded.result.resumeHealth.score).toEqual(pasted.result.resumeHealth.score);
  });

  it('ingests and parses each document exactly once, and runs each stage once', async () => {
    const calls = {};
    const counted = Object.fromEntries(Object.entries(DEFAULT_PIPELINE).map(([name, fn]) => [name, (...args) => {
      calls[name] = (calls[name] || 0) + 1;
      return fn(...args);
    }]));
    const counting = createAnalysisRunner({ pipeline: counted, now });

    await counting({ resume: file(readResumeBuffer('software_developer.txt'), 'cv.txt'), job: { text: JD } });
    expect(calls).toEqual({
      ingestFile: 1, ingestPastedText: 1, parseResume: 1, parseJob: 1, matchRequirements: 1,
      evaluateEligibility: 1, assessResumeHealth: 1, scoreJobMatch: 1, buildRecommendations: 1,
    });

    Object.keys(calls).forEach((k) => delete calls[k]);
    await counting({ resume: { text: RESUME } });
    expect(calls).toEqual({ ingestPastedText: 1, parseResume: 1, assessResumeHealth: 1, buildRecommendations: 1 }); // no job stages at all
  });

  it('needs no AI key and loads no AI or network client', async () => {
    const saved = {};
    for (const key of ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'AI_PROVIDER']) { saved[key] = process.env[key]; delete process.env[key]; }
    try {
      const { result } = await run({ resume: { text: RESUME }, job: { text: JD } });
      expect(result.mode).toBe('job_match');
    } finally {
      for (const [key, value] of Object.entries(saved)) if (value !== undefined) process.env[key] = value;
    }
    const loaded = Object.keys(require.cache).filter((p) => /node_modules[\\/](openai|@google[\\/]genai|@azure-rest|@xenova|axios)[\\/]/.test(p));
    expect(loaded).toEqual([]);
  });

  it('uses the reference date it is given, not the wall clock', async () => {
    const { result } = await createAnalysisRunner({ now: () => REFERENCE_DATE })({ resume: { text: RESUME } });
    expect(result.referenceDate).toBe('2026-09-29');
  });
});

describe('Failure handling in the application layer', () => {
  const rejection = async (input) => {
    try { await run(input); } catch (err) { return err; }
    throw new Error('expected the analysis to be rejected');
  };

  it('rejects an unsupported job file and says which document was at fault', async () => {
    const err = await rejection({ resume: { text: RESUME }, job: file(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3, 4, 5]), 'jd.png') });
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(err.details).toMatchObject({ document: 'job' });
  });

  it('rejects a resume with no readable text', async () => {
    const err = await rejection({ resume: file(Buffer.from('   \n\n   \n  '), 'blank.txt') });
    expect(err.code).toBe('UNPROCESSABLE_DOCUMENT');
    expect(err.details).toMatchObject({ document: 'resume', reason: 'no_text_layer' });
  });

  it('rejects oversized documents instead of truncating them', async () => {
    const longJob = await rejection({ resume: { text: RESUME }, job: { text: `Required\n${'- React is required.\n'.repeat(JOB_TEXT_MAX_CHARS / 10)}` } });
    expect(longJob.code).toBe('PAYLOAD_TOO_LARGE');
    expect(longJob.details).toEqual({ document: 'job' });

    const longResume = await rejection({ resume: file(Buffer.from(`${RESUME}\n${'x'.repeat(RESUME_TEXT_MAX_CHARS)}`), 'long.txt') });
    expect(longResume.code).toBe('PAYLOAD_TOO_LARGE');
    expect(longResume.details).toEqual({ document: 'resume' });
  });

  it('analyses a nearly empty resume honestly: no numeric health score, no invented findings', async () => {
    const { result, record } = await run({ resume: { text: 'Jane Candidate\njane@example.com' } });
    expect(AnalysisResultSchema.safeParse(result).success).toBe(true);
    expect(result.resumeHealth.readability).toBe('unreadable');
    expect(record.summary.resumeHealth).toEqual({ score: null, readability: 'unreadable' });
    expect(result.recommendations.map((r) => r.ruleId)).toEqual(['REC-PARSE-TEXT']);
  });
});
