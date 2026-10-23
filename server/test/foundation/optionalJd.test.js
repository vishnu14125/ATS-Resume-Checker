const { ingestPastedText } = require('../../src/documents/ingest');
const { parseResume } = require('../../src/engine/resume/parseResume');
const { parseJob } = require('../../src/engine/job/parseJob');
const { AnalysisResultSchema, resolveAnalysisMode, AnalysisRequestSchema } = require('../../src/domain/contracts');
const F = require('./helpers/contractFactories');
const { readResumeText, readJdText, REFERENCE_DATE } = require('./helpers/fixtures');

/**
 * The JD is optional. Phase 3 must not break resume-only analysis, and a parsed
 * JobProfile must coexist cleanly with a parsed ResumeProfile without any
 * matching/scoring (that is Phase 4+).
 */
describe('Optional JD — resume-only still works after Phase 3', () => {
  it('parses a resume with no JD into a valid ResumeProfile', async () => {
    const profile = parseResume(await ingestPastedText(readResumeText('cse_student.txt')), { referenceDate: REFERENCE_DATE });
    expect(profile.schemaVersion).toBe('1');
    expect(profile.experience.length).toBeGreaterThan(0);
  });

  it('keeps the resume_only AnalysisResult contract valid (no job, no jobMatch)', () => {
    const result = F.resumeOnlyResult();
    expect(result.mode).toBe('resume_only');
    expect(result.job).toBeNull();
    expect(result.jobMatch).toBeNull();
    expect(AnalysisResultSchema.safeParse(result).success).toBe(true);
  });

  it('treats a missing JD as a valid request state, not an error', () => {
    const request = AnalysisRequestSchema.parse({ resumeVersionId: F.RESUME_VERSION_ID });
    expect(resolveAnalysisMode(request)).toBe('resume_only');
  });

  it('parses a resume and a JD independently; both are valid and carry no cross-references yet', async () => {
    const resume = parseResume(await ingestPastedText(readResumeText('software_developer.txt')), { referenceDate: REFERENCE_DATE });
    const job = parseJob(await ingestPastedText(readJdText('backend_developer.txt')));
    // Both produced, independently; Phase 3 does no matching.
    expect(resume.skillMentions.length).toBeGreaterThan(0);
    expect(job.requirements.length).toBeGreaterThan(0);
    // The job-match result contract remains satisfiable (shape check via the factory).
    expect(AnalysisResultSchema.safeParse(F.jobMatchResult()).success).toBe(true);
  });
});
