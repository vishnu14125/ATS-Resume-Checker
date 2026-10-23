const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { startMemoryDb, buildApp, createCaptureLogger } = require('./helpers/testApp');
const { readResumeBuffer, readResumeText, readJdBuffer, readJdText } = require('./helpers/fixtures');
const { AnalysisResultSchema } = require('../../src/domain/contracts/analysis');
const { ContractViolationError } = require('../../src/domain/contracts');
const { buildAnalysisInput, CreateAnalysisBodySchema } = require('../../src/api/v1/schemas/analyses.schemas');
const { makeId } = require('../../src/engine/text/ids');
const Analysis = require('../../src/infrastructure/db/models/Analysis');

jest.setTimeout(120000);

const RESUME_TXT = readResumeText('software_developer.txt');
const JD_TXT = readJdText('backend_developer.txt');
const SERVER_ROOT = path.resolve(__dirname, '../..');

// A realistic resume carrying every token class the legacy HTTP path destroyed.
const TOKEN_RESUME = [
  'Priya Nair',
  'priya.nair@example.com | +1 (415) 555-0199',
  'https://github.com/priyanair',
  '',
  'SUMMARY',
  'Systems and web engineer working across C++, C# and JavaScript.',
  '',
  'EXPERIENCE',
  'Software Engineer, Northwind Systems',
  'Jan 2021 - Present',
  '• Built low-latency pricing services in C++ and C#, cutting p99 latency by 35%.',
  '• Developed Node.js APIs backed by PostgreSQL, serving 2,000,000 requests/day.',
  '- Wrote JavaScript tooling that reduced build time by 40%.',
  '',
  'Software Developer, Contoso Ltd.',
  'Jun 2018 - Dec 2020',
  '• Maintained internal services in C# and improved test coverage to 90%.',
  '',
  'PROJECTS',
  'Query Gateway',
  '• Built a GraphQL gateway: https://github.com/priyanair/query-gateway',
  '',
  'EDUCATION',
  'B.Tech in Computer Science, National Institute of Technology',
  '2014 - 2018',
  '',
  'SKILLS',
  'C++, C#, JavaScript, Node.js, PostgreSQL, GraphQL',
].join('\n');

const TOKEN_JD = [
  'Platform Engineer', '', 'Required Qualifications',
  '- C++ is required.', '- C# is required.', '- JavaScript is required.', '- Node.js is required.',
  '- PostgreSQL is required.', '- GraphQL is required.', '- Java is required.',
  '- 3+ years of professional experience is required.',
].join('\n');

describe('/api/v1/analyses', () => {
  let db; let app; let alice; let bob;

  const register = async (name) => {
    const res = await request(app).post('/api/v1/auth/register').send({ name, email: `${name.toLowerCase()}@example.com`, password: `${name}-password-1` });
    return { token: res.body.data.accessToken, id: res.body.data.user.id };
  };
  const post = (user) => request(app).post('/api/v1/analyses').set('Authorization', `Bearer ${user.token}`);
  const get = (user, suffix = '') => request(app).get(`/api/v1/analyses${suffix}`).set('Authorization', `Bearer ${user.token}`);
  const assessmentFor = (result, canonicalKey) => {
    const requirement = result.jobMatch.requirements.find((r) => r.canonicalKey === canonicalKey);
    return result.jobMatch.assessments.find((a) => a.requirementId === requirement.id);
  };
  const snippetFor = (result, canonicalKey) => result.evidence.find((e) => e.id === assessmentFor(result, canonicalKey).best.evidenceIds[0]).snippet;
  const expectError = (res, status, code) => {
    expect(res.status).toBe(status);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(code);
    expect(typeof res.body.error.message).toBe('string');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    expect(res.body.data).toBeUndefined();
  };

  beforeAll(async () => {
    db = await startMemoryDb();
    app = buildApp();
  });
  beforeEach(async () => {
    await db.clear();
    alice = await register('Alice');
    bob = await register('Bob');
  });
  afterAll(async () => { await db.stop(); });

  // ── Create ────────────────────────────────────────────────────────────────

  describe('POST — resume only', () => {
    it('analyses an uploaded resume end to end and persists it for the caller', async () => {
      const res = await post(alice).attach('resume', readResumeBuffer('software_developer.txt'), 'software_developer.txt');

      expect(res.status).toBe(201);
      expect(Object.keys(res.body)).toEqual(['success', 'data']);
      expect(res.body.success).toBe(true);
      const { analysis } = res.body.data;
      expect(analysis.id).toMatch(/^[a-f\d]{24}$/);
      expect(analysis.mode).toBe('resume_only');
      expect(analysis.resume).toMatchObject({ kind: 'txt', fileName: 'software_developer.txt' });
      expect(analysis.job).toBeNull();
      expect(analysis.summary.jobMatch).toBeNull();
      expect(analysis.summary.resumeHealth.score).toBeGreaterThan(80);

      expect(AnalysisResultSchema.safeParse(analysis.result).success).toBe(true);
      expect(analysis.result.jobMatch).toBeNull();
      expect(analysis.result.recommendations.length).toBeGreaterThan(0);
      expect(analysis.result.recommendations.every((r) => r.scope === 'resume')).toBe(true);

      const stored = await Analysis.findById(analysis.id).lean();
      expect(String(stored.userId)).toBe(alice.id);
      expect(stored.mode).toBe('resume_only');
      expect(stored.createdAt).toBeInstanceOf(Date);
      expect(stored.updatedAt).toBeInstanceOf(Date);
    });

    it('treats the job description as optional (absent or blank)', async () => {
      const blank = await post(alice).attach('resume', readResumeBuffer('software_developer.txt'), 'cv.txt').field('jobText', '   ');
      expect(blank.status).toBe(201);
      expect(blank.body.data.analysis.mode).toBe('resume_only');

      const json = await post(alice).send({ resumeText: RESUME_TXT });
      expect(json.status).toBe(201);
      expect(json.body.data.analysis).toMatchObject({ mode: 'resume_only', resume: { kind: 'paste', fileName: null } });
    });
  });

  describe('POST — resume + job description', () => {
    it('analyses an uploaded PDF resume against an uploaded DOCX job description', async () => {
      const res = await post(alice)
        .attach('resume', readResumeBuffer('critical_tokens.pdf'), 'critical_tokens.pdf')
        .attach('job', readJdBuffer('backend_developer.docx'), 'backend_developer.docx');

      expect(res.status).toBe(201);
      const { analysis } = res.body.data;
      expect(analysis.mode).toBe('job_match');
      expect(analysis.resume.kind).toBe('pdf');
      expect(analysis.job).toMatchObject({ kind: 'docx', fileName: 'backend_developer.docx', company: 'DataForge' });

      const { result } = analysis;
      expect(AnalysisResultSchema.safeParse(result).success).toBe(true);
      expect(typeof result.jobMatch.score.score).toBe('number');
      expect(result.jobMatch.assessments.length).toBe(result.jobMatch.requirements.length);
      expect(result.evidence.length).toBeGreaterThan(0);
      expect(result.jobMatch.eligibility.status).toBe('clear');
      expect(result.recommendations.some((r) => r.scope === 'job')).toBe(true);
      expect(analysis.summary.jobMatch).toEqual({ score: result.jobMatch.score.score, eligibility: 'clear', hardKnockout: false });
      expect(analysis.versions).toMatchObject({ engine: result.engine.version, taxonomy: '2026.1', jobParser: result.engine.jobParserVersion });

      expect((await Analysis.findById(analysis.id).lean()).mode).toBe('job_match');
    });

    it('accepts a resume file with pasted job text', async () => {
      const res = await post(alice).attach('resume', readResumeBuffer('software_developer.txt'), 'cv.txt').field('jobText', JD_TXT);
      expect(res.status).toBe(201);
      expect(res.body.data.analysis).toMatchObject({ mode: 'job_match', job: { kind: 'paste', fileName: null } });
    });

    it('reports a critical knockout beside an uncapped Job Match Score', async () => {
      const res = await post(alice).send({
        resumeText: `${RESUME_TXT}\nNo security clearance.`,
        jobText: `${JD_TXT}\n- Must have an active Secret security clearance.`,
      });
      const { analysis } = res.body.data;
      expect(analysis.summary.jobMatch).toMatchObject({ eligibility: 'likely_filtered', hardKnockout: true });
      expect(analysis.result.jobMatch.eligibility.status).toBe('likely_filtered');

      const withoutKnockout = await post(alice).send({ resumeText: `${RESUME_TXT}\nNo security clearance.`, jobText: JD_TXT });
      expect(analysis.summary.jobMatch.score).toBe(withoutKnockout.body.data.analysis.summary.jobMatch.score);
      expect(analysis.summary.jobMatch.score).toBeGreaterThan(40);
    });
  });

  // ── Regression: the legacy HTTP path collapsed newlines, stripped characters and truncated ──

  describe('input reaches the engine intact (regression for the legacy production-path bug)', () => {
    it('preserves line structure and critical tokens from API to analysis', async () => {
      const res = await post(alice).send({ resumeText: TOKEN_RESUME, jobText: TOKEN_JD });
      expect(res.status).toBe(201);
      const { result } = res.body.data.analysis;

      // "+", "#" and "." tokens are distinct skills, each matched against its own requirement.
      for (const key of ['skill:c++', 'skill:c#', 'skill:javascript', 'skill:node.js', 'skill:postgresql', 'skill:graphql']) {
        expect(assessmentFor(result, key).status).toBe('met');
      }
      expect(assessmentFor(result, 'skill:java').status).toBe('missing'); // JavaScript is not Java

      // Evidence is one original line each: bullets, percentages, separators and URLs survive, lines are not merged.
      expect(snippetFor(result, 'skill:c++')).toBe('• Built low-latency pricing services in C++ and C#, cutting p99 latency by 35%.');
      expect(snippetFor(result, 'skill:node.js')).toBe('• Developed Node.js APIs backed by PostgreSQL, serving 2,000,000 requests/day.');
      expect(snippetFor(result, 'skill:javascript')).toBe('- Wrote JavaScript tooling that reduced build time by 40%.');
      expect(snippetFor(result, 'skill:graphql')).toBe('• Built a GraphQL gateway: https://github.com/priyanair/query-gateway');

      // Date ranges survive: experience is established from them.
      const experience = assessmentFor(result, 'years:general');
      expect(experience.status).toBe('met');
      expect(experience.details.demonstrated.bestMonths).toBeGreaterThanOrEqual(90);

      // Sections, contact details and metrics were all recognised, which requires intact newlines and "@" / "%".
      const check = (checkId) => result.resumeHealth.checks.find((c) => c.checkId === checkId).result;
      expect(check('standard_headings')).toBe('pass');
      expect(check('contact_email')).toBe('pass');
      expect(check('contact_phone')).toBe('pass');
      expect(check('dated_roles')).toBe('pass');
      const metrics = result.resumeHealth.score.components.find((c) => c.id === 'impact').items.find((i) => i.subjectId === makeId('fnd', 'IMPACT-METRICS'));
      expect(metrics.credit).toBe(1);
    });

    it('gives identical analysis for the same text sent as JSON or as a multipart field with CRLF line endings', async () => {
      const json = await post(alice).send({ resumeText: TOKEN_RESUME, jobText: TOKEN_JD });
      const multipart = await post(alice).field('resumeText', TOKEN_RESUME.replace(/\n/g, '\r\n')).field('jobText', TOKEN_JD.replace(/\n/g, '\r\n'));
      expect(multipart.status).toBe(201);
      const a = json.body.data.analysis.result;
      const b = multipart.body.data.analysis.result;
      expect(b.resume.resumeTextHash).toBe(a.resume.resumeTextHash);
      expect(b.job.jobTextHash).toBe(a.job.jobTextHash);
      expect(b.jobMatch.score).toEqual(a.jobMatch.score);
    });

    it('does not truncate: a skill stated after the first 10,000 characters is still found', async () => {
      const filler = Array.from({ length: 160 }, (_, i) => `• Delivered iteration ${i + 1} of the billing platform with measurable reliability improvements.`);
      const lines = TOKEN_RESUME.split('\n');
      const longResume = [...lines.slice(0, 13), ...filler, ...lines.slice(13), 'Kubernetes'].join('\n');
      expect(longResume.indexOf('Kubernetes')).toBeGreaterThan(10000);

      const res = await post(alice).send({ resumeText: longResume, jobText: 'Engineer\n\nRequired Qualifications\n- Kubernetes is required.' });
      expect(res.status).toBe(201);
      const { result } = res.body.data.analysis;
      expect(assessmentFor(result, 'skill:kubernetes').status).toBe('met');
      expect(snippetFor(result, 'skill:kubernetes')).toBe('Kubernetes');
    });

    it('preserves the same tokens when they arrive inside a real PDF', async () => {
      const res = await post(alice)
        .attach('resume', readResumeBuffer('critical_tokens.pdf'), 'critical_tokens.pdf')
        .field('jobText', 'Engineer\n\nRequired Qualifications\n- C++ is required.\n- C# is required.\n- JavaScript is required.\n- Node.js is required.');
      const { result } = res.body.data.analysis;
      for (const key of ['skill:c++', 'skill:c#', 'skill:javascript', 'skill:node.js']) expect(assessmentFor(result, key).status).toBe('met');
      expect(result.resumeHealth.checks.find((c) => c.checkId === 'contact_email').result).toBe('pass');
    });

    it('the request schema and input builder never alter text', () => {
      const text = '  \tLine one  \r\n\r\n• C++ / C#  &  100%\n\n';
      const parsed = CreateAnalysisBodySchema.parse({ resumeText: text, jobText: text });
      expect(parsed).toEqual({ resumeText: text, jobText: text });
      const input = buildAnalysisInput(parsed, undefined);
      expect(input.resume.text).toBe(text);
      expect(input.job.text).toBe(text);
    });
  });

  // ── Retrieve ──────────────────────────────────────────────────────────────

  describe('GET /:analysisId', () => {
    let created;
    beforeEach(async () => {
      created = (await post(alice).send({ resumeText: TOKEN_RESUME, jobText: TOKEN_JD })).body.data.analysis;
    });

    it('returns the stored analysis to its owner, identical to what was created and still contract-valid', async () => {
      const res = await get(alice, `/${created.id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.analysis).toEqual(created);
      expect(AnalysisResultSchema.safeParse(res.body.data.analysis.result).success).toBe(true);
      expect(Object.keys(res.body.data.analysis).sort()).toEqual(['ai', 'createdAt', 'id', 'job', 'mode', 'result', 'resume', 'summary', 'versions']);
    });

    it('returns 404 to another user and never reveals the content', async () => {
      const res = await get(bob, `/${created.id}`);
      expectError(res, 404, 'NOT_FOUND');
      expect(JSON.stringify(res.body)).not.toMatch(/Priya|Northwind|C\+\+/);
    });

    it('returns 404 for a missing analysis and for a malformed id', async () => {
      expectError(await get(alice, '/64b7f0c2a1b2c3d4e5f60718'), 404, 'NOT_FOUND');
      expectError(await get(alice, '/not-an-id'), 404, 'NOT_FOUND');
      expectError(await get(alice, '/%7B%22%24ne%22%3Anull%7D'), 404, 'NOT_FOUND');
    });
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  describe('DELETE /:analysisId', () => {
    const del = (user, id) => request(app).delete(`/api/v1/analyses/${id}`).set('Authorization', `Bearer ${user.token}`);
    let created;
    beforeEach(async () => {
      created = (await post(alice).send({ resumeText: RESUME_TXT })).body.data.analysis;
    });

    it('lets the owner delete an analysis permanently', async () => {
      const res = await del(alice, created.id);
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(await Analysis.countDocuments({ _id: created.id })).toBe(0);
      expectError(await get(alice, `/${created.id}`), 404, 'NOT_FOUND');
      expect((await get(alice)).body.data.items).toEqual([]);
      expectError(await del(alice, created.id), 404, 'NOT_FOUND'); // already gone
    });

    it('returns 404 to another user and leaves the analysis in place', async () => {
      expectError(await del(bob, created.id), 404, 'NOT_FOUND');
      expect(await Analysis.countDocuments({ _id: created.id })).toBe(1);
      expect((await get(alice, `/${created.id}`)).status).toBe(200);
    });

    it('returns 404 for missing and malformed ids, and 401 without a token', async () => {
      expectError(await del(alice, '64b7f0c2a1b2c3d4e5f60718'), 404, 'NOT_FOUND');
      expectError(await del(alice, 'not-an-id'), 404, 'NOT_FOUND');
      expectError(await request(app).delete(`/api/v1/analyses/${created.id}`), 401, 'UNAUTHENTICATED');
      expect(await Analysis.countDocuments()).toBe(1);
    });

    it('deletes only the named analysis', async () => {
      const other = (await post(alice).send({ resumeText: TOKEN_RESUME })).body.data.analysis;
      await del(alice, created.id);
      expect((await get(alice)).body.data.items.map((i) => i.id)).toEqual([other.id]);
    });
  });

  // ── List ──────────────────────────────────────────────────────────────────

  describe('GET / (history)', () => {
    it('lists only the caller\'s analyses, newest first, as summaries with cursor pagination', async () => {
      const ids = [];
      for (const text of [RESUME_TXT, TOKEN_RESUME, `${RESUME_TXT}\nDocker`]) ids.push((await post(alice).send({ resumeText: text })).body.data.analysis.id);
      await post(bob).send({ resumeText: RESUME_TXT });

      const first = await get(alice, '?limit=2');
      expect(first.status).toBe(200);
      expect(first.body.data.items.map((i) => i.id)).toEqual([ids[2], ids[1]]);
      expect(first.body.data.items[0].result).toBeUndefined();
      expect(first.body.data.items[0]).toMatchObject({ mode: 'resume_only', summary: { jobMatch: null } });
      expect(first.body.data.nextCursor).toBe(ids[1]);

      const second = await get(alice, `?limit=2&cursor=${first.body.data.nextCursor}`);
      expect(second.body.data.items.map((i) => i.id)).toEqual([ids[0]]);
      expect(second.body.data.nextCursor).toBeNull();

      expect((await get(bob)).body.data.items.length).toBe(1);
    });

    it('bounds the page size and rejects malformed paging parameters', async () => {
      expectError(await get(alice, '?limit=500'), 400, 'VALIDATION_ERROR');
      expectError(await get(alice, '?limit=0'), 400, 'VALIDATION_ERROR');
      expectError(await get(alice, '?cursor=abc'), 400, 'VALIDATION_ERROR');
      expectError(await get(alice, '?userId=someone-else'), 400, 'VALIDATION_ERROR');
      expect((await get(alice)).body.data).toEqual({ items: [], nextCursor: null });
    });
  });

  // ── Authentication ────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('rejects unauthenticated create, read and list, and stores nothing', async () => {
      expectError(await request(app).post('/api/v1/analyses').attach('resume', readResumeBuffer('software_developer.txt'), 'cv.txt'), 401, 'UNAUTHENTICATED');
      expectError(await request(app).post('/api/v1/analyses').send({ resumeText: RESUME_TXT }), 401, 'UNAUTHENTICATED');
      expectError(await request(app).get('/api/v1/analyses'), 401, 'UNAUTHENTICATED');
      expectError(await request(app).get('/api/v1/analyses/64b7f0c2a1b2c3d4e5f60718'), 401, 'UNAUTHENTICATED');
      expectError(await request(app).get('/api/v1/analyses').set('Authorization', 'Bearer not-a-token'), 401, 'UNAUTHENTICATED');
      expect(await Analysis.countDocuments()).toBe(0);
    });
  });

  // ── Invalid input ─────────────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('limits analysis creation separately, without affecting reads or storing the rejected analysis', async () => {
      const limitedApp = buildApp({ env: { ANALYSIS_RATE_LIMIT_MAX: '2' } });
      const create = () => request(limitedApp).post('/api/v1/analyses').set('Authorization', `Bearer ${alice.token}`).send({ resumeText: RESUME_TXT });
      expect((await create()).status).toBe(201);
      expect((await create()).status).toBe(201);
      expectError(await create(), 429, 'RATE_LIMITED');
      expect(await Analysis.countDocuments({})).toBe(2);
      const list = await request(limitedApp).get('/api/v1/analyses').set('Authorization', `Bearer ${alice.token}`);
      expect(list.status).toBe(200);
    });
  });

  describe('request validation', () => {
    it('requires a resume', async () => {
      const res = await post(alice).send({ jobText: JD_TXT });
      expectError(res, 400, 'VALIDATION_ERROR');
      expect(res.body.error.details.issues).toEqual([expect.objectContaining({ path: 'body.resume' })]);
      expectError(await post(alice).field('resumeText', '   '), 400, 'VALIDATION_ERROR');
      expectError(await post(alice), 400, 'VALIDATION_ERROR');
    });

    it('rejects a document sent both as a file and as text', async () => {
      const res = await post(alice).attach('resume', readResumeBuffer('software_developer.txt'), 'cv.txt').field('resumeText', RESUME_TXT);
      expectError(res, 400, 'VALIDATION_ERROR');
      expect(res.body.error.details.issues[0].path).toBe('body.resumeText');
    });

    it('rejects unknown fields, unexpected file fields, extra files and non-string text', async () => {
      expectError(await post(alice).send({ resumeText: RESUME_TXT, userId: bob.id }), 400, 'VALIDATION_ERROR');
      expectError(await post(alice).send({ resumeText: 42 }), 400, 'VALIDATION_ERROR');
      expectError(await post(alice).attach('cv', readResumeBuffer('software_developer.txt'), 'cv.txt'), 400, 'VALIDATION_ERROR');
      const twoResumes = await post(alice)
        .attach('resume', readResumeBuffer('software_developer.txt'), 'a.txt')
        .attach('resume', readResumeBuffer('cse_student.txt'), 'b.txt');
      expectError(twoResumes, 400, 'VALIDATION_ERROR');
      expect(await Analysis.countDocuments()).toBe(0);
    });
  });

  describe('document validation', () => {
    it('rejects unsupported files by their content, not their name or MIME type', async () => {
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
      const disguised = await post(alice).attach('resume', png, { filename: 'resume.pdf', contentType: 'application/pdf' });
      expectError(disguised, 415, 'UNSUPPORTED_MEDIA_TYPE');
      expect(disguised.body.error.details).toMatchObject({ document: 'resume' });

      expectError(await post(alice).attach('resume', Buffer.from('plain text resume content here'), 'resume.exe'), 415, 'UNSUPPORTED_MEDIA_TYPE');

      const badJob = await post(alice).attach('resume', readResumeBuffer('software_developer.txt'), 'cv.txt').attach('job', png, 'jd.png');
      expectError(badJob, 415, 'UNSUPPORTED_MEDIA_TYPE');
      expect(badJob.body.error.details).toMatchObject({ document: 'job' });
    });

    it('rejects unreadable documents with 422', async () => {
      expectError(await post(alice).attach('resume', Buffer.alloc(0), 'empty.txt'), 422, 'UNPROCESSABLE_DOCUMENT');
      const blank = await post(alice).attach('resume', Buffer.from('   \n\n\t\n   \n'), 'blank.txt');
      expectError(blank, 422, 'UNPROCESSABLE_DOCUMENT');
      expect(blank.body.error.details).toMatchObject({ document: 'resume', reason: 'no_text_layer' });
      expectError(await post(alice).attach('resume', Buffer.from('%PDF-1.7\nthis is not really a pdf document at all'), 'broken.pdf'), 422, 'UNPROCESSABLE_DOCUMENT');
      expect(await Analysis.countDocuments()).toBe(0);
    });

    it('rejects oversized uploads and over-long text with 413', async () => {
      expectError(await post(alice).attach('resume', Buffer.alloc(10 * 1024 * 1024 + 1, 0x61), 'huge.txt'), 413, 'PAYLOAD_TOO_LARGE');
      expectError(await post(alice).attach('resume', Buffer.alloc(2 * 1024 * 1024, 0x61), 'big.txt'), 413, 'PAYLOAD_TOO_LARGE');
      const longJob = await post(alice).send({ resumeText: RESUME_TXT, jobText: `Required\n${'- React is required.\n'.repeat(2000)}` });
      expectError(longJob, 413, 'PAYLOAD_TOO_LARGE');
      expect(longJob.body.error.details).toEqual({ document: 'job' });
    });

    it('still analyses a readable but nearly empty resume, without inventing a score', async () => {
      const res = await post(alice).send({ resumeText: 'Jane Candidate\njane@example.com' });
      expect(res.status).toBe(201);
      expect(res.body.data.analysis.summary.resumeHealth).toEqual({ score: null, readability: 'unreadable' });
    });
  });

  // ── Storage, files and failures ───────────────────────────────────────────

  describe('what is stored and what is left behind', () => {
    it('stores the result and metadata only: no document text, profile, file bytes or credentials', async () => {
      const { id } = (await post(alice).send({ resumeText: TOKEN_RESUME, jobText: TOKEN_JD })).body.data.analysis;
      const stored = await Analysis.findById(id).lean();
      expect(Object.keys(stored).sort()).toEqual(['__v', '_id', 'ai', 'createdAt', 'job', 'mode', 'result', 'resume', 'summary', 'updatedAt', 'userId', 'versions']);
      expect(Object.keys(stored.resume).sort()).toEqual(['fileName', 'kind', 'sizeBytes', 'textHash']);

      const json = JSON.stringify(stored);
      expect(json).not.toContain('priya.nair@example.com'); // contact line is not evidence, so it is not stored
      expect(json).not.toContain('555-0199');
      expect(json).not.toContain(alice.token);
      expect(json).not.toMatch(/password|accessToken|authorization/i);
      expect(json).not.toMatch(/"(lines|originalText|skillMentions|contact)"/);
    });

    it('writes no temporary files on success or on any failure path', async () => {
      const uploads = path.join(SERVER_ROOT, 'uploads'); // not used by the server; listed only if a developer still has one
      const snapshot = () => ({ uploads: fs.existsSync(uploads) ? fs.readdirSync(uploads).sort() : null, root: fs.readdirSync(SERVER_ROOT).sort() });
      const before = snapshot();

      await post(alice).attach('resume', readResumeBuffer('critical_tokens.pdf'), 'critical_tokens.pdf').attach('job', readJdBuffer('backend_developer.docx'), 'jd.docx');
      await post(alice).attach('resume', Buffer.from('%PDF-1.7\nnot a pdf at all, just some bytes'), 'broken.pdf'); // parse failure
      await post(alice).attach('resume', Buffer.alloc(64, 0), 'binary.bin'); // validation failure
      await post(alice).attach('resume', readResumeBuffer('software_developer.txt'), 'cv.txt').attach('job', Buffer.alloc(0), 'empty.docx'); // second document fails
      await request(app).post('/api/v1/analyses').attach('resume', readResumeBuffer('software_developer.txt'), 'cv.txt'); // rejected before upload handling

      expect(snapshot()).toEqual(before);
    });

    it('never logs document content, contact details or tokens', async () => {
      const { logger, lines } = createCaptureLogger('debug');
      const loggedApp = buildApp({ logger });
      await request(loggedApp).post('/api/v1/analyses').set('Authorization', `Bearer ${alice.token}`).send({ resumeText: TOKEN_RESUME, jobText: TOKEN_JD });
      await request(loggedApp).post('/api/v1/analyses').set('Authorization', `Bearer ${alice.token}`).attach('resume', Buffer.alloc(64, 0), 'binary.bin');

      const logged = JSON.stringify(lines);
      expect(lines.some((l) => l.event === 'http.request' && l.path === '/api/v1/analyses' && l.status === 201)).toBe(true);
      expect(logged).not.toMatch(/priya|Northwind|C\+\+|555-0199/i);
      expect(logged).not.toContain(alice.token);
    });
  });

  describe('server-side failures', () => {
    const failingApp = (overrides) => {
      const { logger, lines } = createCaptureLogger('debug');
      return { app: buildApp({ logger, overrides }), lines };
    };

    it('turns a database failure into a generic 500 without leaking internals', async () => {
      const dbError = Object.assign(new Error('connect ECONNREFUSED mongodb://TEST_USER_NOT_REAL:TEST_PASSWORD_NOT_REAL@db.internal:27017/ats'), { name: 'MongoNetworkError' });
      const { app: broken, lines } = failingApp({ analysisRepository: { create: async () => { throw dbError; }, findOwned: async () => { throw dbError; }, listOwned: async () => { throw dbError; } } });

      for (const res of [
        await request(broken).post('/api/v1/analyses').set('Authorization', `Bearer ${alice.token}`).send({ resumeText: RESUME_TXT }),
        await request(broken).get('/api/v1/analyses/64b7f0c2a1b2c3d4e5f60718').set('Authorization', `Bearer ${alice.token}`),
        await request(broken).get('/api/v1/analyses').set('Authorization', `Bearer ${alice.token}`),
      ]) {
        expectError(res, 500, 'INTERNAL_ERROR');
        expect(res.body.error.message).toBe('An unexpected error occurred.');
        expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|TEST_PASSWORD_NOT_REAL|db\.internal|mongodb|stack|debug/i);
      }
      expect(lines.filter((l) => l.event === 'http.error' && l.status === 500).length).toBe(3); // logged for operators
    });

    it('turns an invalid analysis result into a generic 500 and stores nothing', async () => {
      const violation = new ContractViolationError('AnalysisResult', [{ path: ['jobMatch', 'score'], message: 'score must equal the sum of component contributions' }]);
      const { app: broken } = failingApp({ runAnalysis: async () => { throw violation; } });
      const res = await request(broken).post('/api/v1/analyses').set('Authorization', `Bearer ${alice.token}`).send({ resumeText: RESUME_TXT });
      expectError(res, 500, 'INTERNAL_ERROR');
      expect(JSON.stringify(res.body)).not.toMatch(/contract|jobMatch|contributions/i);
      expect(await Analysis.countDocuments()).toBe(0);
    });
  });

  describe('existing protections still apply', () => {
    it('keeps the global rate limit on the analyses routes', async () => {
      const limited = buildApp({ env: { RATE_LIMIT_MAX: '2' } });
      const call = () => request(limited).get('/api/v1/analyses').set('Authorization', `Bearer ${alice.token}`);
      expect((await call()).status).toBe(200);
      expect((await call()).status).toBe(200);
      expectError(await call(), 429, 'RATE_LIMITED');
    });
  });
});
