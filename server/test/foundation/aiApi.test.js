const request = require('supertest');
const { startMemoryDb, buildApp, createCaptureLogger } = require('./helpers/testApp');
const { AnalysisResultSchema } = require('../../src/domain/contracts/analysis');
const { AiEnrichmentSchema, AiTaskResultSchema } = require('../../src/domain/contracts/ai');
const { AiProviderError } = require('../../src/application/ai/aiProvider');
const Analysis = require('../../src/infrastructure/db/models/Analysis');

jest.setTimeout(120000);

const RESUME = [
  'Priya Nair', 'priya.nair@example.com | +1 (415) 555-0199', '',
  'EXPERIENCE', 'Software Engineer, Northwind Systems', 'Jan 2023 - Present',
  '- Worked on backend APIs with Node.js for the payments team.',
  '- Built dashboards with React, improving page load time by 30%.', '',
  'EDUCATION', 'B.Tech in Computer Science, National Institute of Technology', '2018 - 2022', '',
  'SKILLS', 'Node.js, React, PostgreSQL, Git',
].join('\n');
const JD = [
  'Backend Engineer', '', 'Required Qualifications',
  '- Node.js is required.', '- React is required.', '- SQL is required.', '- Kubernetes is required.',
  '- Must have an active Secret security clearance.',
].join('\n');

/** A provider that answers the resume explanation soundly, using only supplied ids. */
function fakeProvider(respond) {
  const calls = [];
  const answer = respond || ((input) => ({
    summary: `Your resume has a health score of ${input.resumeHealth.score}.`,
    strengths: [{ text: 'The document text was extracted cleanly.', sourceIds: [input.passedChecks[0].id] }],
    improvements: [],
  }));
  return {
    name: 'gemini',
    model: 'test-model',
    calls,
    async generateJson(req) {
      calls.push(req);
      const out = await answer(JSON.parse(/<task_input>\n([\s\S]*)\n<\/task_input>/.exec(req.user)[1]), req);
      return typeof out === 'string' ? out : JSON.stringify(out);
    },
  };
}

describe('/api/v1/analyses/:analysisId/ai', () => {
  let db; let alice; let bob;

  const register = async (app, name) => {
    const res = await request(app).post('/api/v1/auth/register').send({ name, email: `${name.toLowerCase()}@example.com`, password: `${name}-password-1` });
    return { token: res.body.data.accessToken, id: res.body.data.user.id };
  };
  const appWith = (overrides, env = {}) => buildApp({ env: { AI_RATE_LIMIT_MAX: '1000', ...env }, overrides });
  const as = (user) => ({ Authorization: `Bearer ${user.token}` });
  const createAnalysis = async (app, user, body = { resumeText: RESUME, jobText: JD }) => (await request(app).post('/api/v1/analyses').set(as(user)).send(body)).body.data.analysis;
  const runAi = (app, user, id, body) => request(app).post(`/api/v1/analyses/${id}/ai`).set(as(user)).send(body);
  const getAnalysis = async (app, user, id) => (await request(app).get(`/api/v1/analyses/${id}`).set(as(user))).body.data.analysis;

  beforeAll(async () => { db = await startMemoryDb(); });
  beforeEach(async () => {
    await db.clear();
    const app = appWith({});
    alice = await register(app, 'Alice');
    bob = await register(app, 'Bob');
  });
  afterAll(async () => { await db.stop(); });

  describe('without an AI provider (no API key)', () => {
    it('analysis works fully and reports AI as unavailable', async () => {
      const app = appWith({}); // default test config: no AI_PROVIDER, no key
      const analysis = await createAnalysis(app, alice);

      expect(analysis.ai).toEqual({ status: 'unavailable', provider: null, model: null, results: [] });
      expect(AiEnrichmentSchema.safeParse(analysis.ai).success).toBe(true);
      expect(AnalysisResultSchema.safeParse(analysis.result).success).toBe(true);
      expect(typeof analysis.summary.resumeHealth.score).toBe('number');
      expect(typeof analysis.summary.jobMatch.score).toBe('number');
      expect(analysis.result.jobMatch.eligibility.status).toBe('review');
      expect(analysis.result.recommendations.length).toBeGreaterThan(0);

      const res = await runAi(app, alice, analysis.id, { task: 'resume_explanation' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { ai: expect.objectContaining({ task: 'resume_explanation', status: 'unavailable', reason: 'not_configured', provider: null, model: null, output: null }) },
      });
      expect((await getAnalysis(app, alice, analysis.id)).ai.results).toEqual([]);
    });

    it('a configured provider with a missing key also leaves the backend fully usable', async () => {
      const app = buildApp({ env: { AI_PROVIDER: 'gemini', AI_MODEL: 'some-model' } }); // key absent
      const analysis = await createAnalysis(app, alice);
      expect(analysis.ai.status).toBe('unavailable');
      expect(analysis.summary.resumeHealth.score).toBeGreaterThan(0);
    });
  });

  describe('with an AI provider', () => {
    it('creating an analysis never calls the model', async () => {
      const provider = fakeProvider(() => { throw new Error('AI must not run during analysis'); });
      const app = appWith({ aiProvider: provider });
      const analysis = await createAnalysis(app, alice);
      expect(provider.calls.length).toBe(0);
      expect(analysis.ai).toEqual({ status: 'available', provider: 'gemini', model: 'test-model', results: [] });
      await request(app).get('/api/v1/analyses').set(as(alice));
      await getAnalysis(app, alice, analysis.id);
      expect(provider.calls.length).toBe(0);
    });

    it('generates a grounded result on demand, stores it, and leaves the analysis result unchanged', async () => {
      const provider = fakeProvider();
      const app = appWith({ aiProvider: provider });
      const analysis = await createAnalysis(app, alice);

      const res = await runAi(app, alice, analysis.id, { task: 'resume_explanation' });
      expect(res.status).toBe(200);
      const { ai } = res.body.data;
      expect(AiTaskResultSchema.safeParse(ai).success).toBe(true);
      expect(ai).toMatchObject({ task: 'resume_explanation', status: 'completed', provider: 'gemini', model: 'test-model' });
      expect(ai.output.strengths[0].sourceIds[0]).toMatch(/^chk_/);

      const after = await getAnalysis(app, alice, analysis.id);
      expect(after.ai).toEqual({ status: 'available', provider: 'gemini', model: 'test-model', results: [ai] });
      expect(AiEnrichmentSchema.safeParse(after.ai).success).toBe(true);
      expect(after.result).toEqual(analysis.result); // deterministic result untouched
      expect(after.summary).toEqual(analysis.summary);

      // Second request is served from storage; regenerate asks the model again.
      expect((await runAi(app, alice, analysis.id, { task: 'resume_explanation' })).body.data.ai).toEqual(ai);
      expect(provider.calls.length).toBe(1);
      await runAi(app, alice, analysis.id, { task: 'resume_explanation', regenerate: true });
      expect(provider.calls.length).toBe(2);
    });

    it('stores only the validated result: no prompt, no raw response', async () => {
      const app = appWith({ aiProvider: fakeProvider() });
      const analysis = await createAnalysis(app, alice);
      await runAi(app, alice, analysis.id, { task: 'resume_explanation' });

      const stored = await Analysis.findById(analysis.id).lean();
      expect(Object.keys(stored.ai)).toEqual(['resume_explanation']);
      expect(Object.keys(stored.ai.resume_explanation).sort()).toEqual(['droppedItems', 'generatedAt', 'model', 'output', 'promptVersion', 'provider', 'reason', 'status', 'task']);
      expect(JSON.stringify(stored.ai)).not.toMatch(/task_input|GROUNDING RULES|systemInstruction/);
      expect((await request(app).get('/api/v1/analyses').set(as(alice))).body.data.items[0].ai).toBeUndefined();
    });

    it('enforces authentication, ownership and request validation', async () => {
      const provider = fakeProvider();
      const app = appWith({ aiProvider: provider });
      const analysis = await createAnalysis(app, alice);
      const url = `/api/v1/analyses/${analysis.id}/ai`;

      expect((await request(app).post(url).send({ task: 'resume_explanation' })).status).toBe(401);
      const foreign = await runAi(app, bob, analysis.id, { task: 'resume_explanation' });
      expect(foreign.status).toBe(404);
      expect(foreign.body.error.code).toBe('NOT_FOUND');
      expect((await runAi(app, alice, 'not-an-id', { task: 'resume_explanation' })).status).toBe(404);
      expect((await runAi(app, alice, '64b7f0c2a1b2c3d4e5f60718', { task: 'resume_explanation' })).status).toBe(404);

      for (const body of [{}, { task: 'rewrite_my_resume' }, { task: 'resume_explanation', model: 'other' }, { task: 'resume_explanation', regenerate: 'yes' }]) {
        const res = await runAi(app, alice, analysis.id, body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect(provider.calls.length).toBe(0);
    });

    it('reports not_applicable for job tasks on a resume-only analysis, without a model call', async () => {
      const provider = fakeProvider();
      const app = appWith({ aiProvider: provider });
      const analysis = await createAnalysis(app, alice, { resumeText: RESUME });
      const res = await runAi(app, alice, analysis.id, { task: 'interview_prep' });
      expect(res.status).toBe(200);
      expect(res.body.data.ai).toMatchObject({ status: 'not_applicable', reason: 'requires_job_description', output: null });
      expect(provider.calls.length).toBe(0);
    });

    it.each([
      ['a provider timeout', () => { throw new AiProviderError('timeout', { provider: 'gemini' }); }, 'unavailable', 'provider_timeout'],
      ['a provider outage', () => { throw new AiProviderError('unavailable', { provider: 'gemini', status: 503 }); }, 'unavailable', 'provider_unavailable'],
      ['a rate limit', () => { throw new AiProviderError('rate_limited', { provider: 'gemini', status: 429 }); }, 'unavailable', 'provider_rate_limited'],
      ['malformed JSON', () => '{"summary": ', 'failed', 'invalid_output'],
      ['a hallucinated answer', () => ({ summary: 'You have 15 years of experience at Google.', strengths: [], improvements: [] }), 'failed', 'ungrounded_output'],
    ])('%s is an explicit AI status, not an API error, and the analysis is unaffected', async (label, respond, status, reason) => {
      const app = appWith({ aiProvider: fakeProvider(respond) });
      const analysis = await createAnalysis(app, alice);

      const res = await runAi(app, alice, analysis.id, { task: 'resume_explanation' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ai).toMatchObject({ status, reason, output: null });

      const after = await getAnalysis(app, alice, analysis.id);
      expect(after.ai.results).toEqual([]);
      expect(after.result).toEqual(analysis.result);
      expect(after.summary.jobMatch.score).toBe(analysis.summary.jobMatch.score);
      expect(after.result.jobMatch.eligibility).toEqual(analysis.result.jobMatch.eligibility);
      expect(after.result.recommendations.length).toBe(analysis.result.recommendations.length);
    });

    it('sends the provider no token, user id, analysis id or contact details', async () => {
      const provider = fakeProvider();
      const app = appWith({ aiProvider: provider });
      const analysis = await createAnalysis(app, alice);
      await runAi(app, alice, analysis.id, { task: 'resume_explanation' });

      const sent = JSON.stringify(provider.calls[0]);
      expect(sent).not.toContain(alice.token);
      expect(sent).not.toContain(alice.id);
      expect(sent).not.toContain(analysis.id);
      expect(sent).not.toMatch(/priya\.nair@example\.com|555-0199|alice@example\.com/);
    });

    it('logs the task outcome without any content', async () => {
      const { logger, lines } = createCaptureLogger('debug');
      const app = buildApp({ logger, env: { AI_RATE_LIMIT_MAX: '1000' }, overrides: { aiProvider: fakeProvider() } });
      const analysis = await createAnalysis(app, alice);
      await runAi(app, alice, analysis.id, { task: 'resume_explanation' });

      const event = lines.find((l) => l.event === 'ai.task');
      expect(event).toMatchObject({ task: 'resume_explanation', status: 'completed', reason: null, provider: 'gemini', model: 'test-model', droppedItems: 0 });
      expect(JSON.stringify(lines)).not.toMatch(/Priya|Northwind|health score of|task_input/);
      expect(JSON.stringify(lines)).not.toContain(alice.token);
    });

    it('deletes AI results together with the analysis', async () => {
      const app = appWith({ aiProvider: fakeProvider() });
      const analysis = await createAnalysis(app, alice);
      await runAi(app, alice, analysis.id, { task: 'resume_explanation' });
      expect((await request(app).delete(`/api/v1/analyses/${analysis.id}`).set(as(alice))).status).toBe(204);
      expect(await Analysis.countDocuments()).toBe(0);
      expect((await runAi(app, alice, analysis.id, { task: 'resume_explanation' })).status).toBe(404);
    });

    it('rate-limits AI requests separately', async () => {
      const provider = fakeProvider();
      const app = appWith({ aiProvider: provider }, { AI_RATE_LIMIT_MAX: '2' });
      const analysis = await createAnalysis(app, alice);
      expect((await runAi(app, alice, analysis.id, { task: 'resume_explanation', regenerate: true })).status).toBe(200);
      expect((await runAi(app, alice, analysis.id, { task: 'resume_explanation', regenerate: true })).status).toBe(200);
      const limited = await runAi(app, alice, analysis.id, { task: 'resume_explanation', regenerate: true });
      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
      expect(provider.calls.length).toBe(2);
      expect((await request(app).get(`/api/v1/analyses/${analysis.id}`).set(as(alice))).status).toBe(200); // the analysis itself is not limited
    });
  });
});
