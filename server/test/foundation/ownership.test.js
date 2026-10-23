const request = require('supertest');
const { startMemoryDb, buildApp } = require('./helpers/testApp');
const { findOwnedById } = require('../../src/infrastructure/repositories/ownership');
const User = require('../../src/infrastructure/db/models/User');
const Analysis = require('../../src/infrastructure/db/models/Analysis');

jest.setTimeout(60000);

describe('Ownership and cross-user access prevention', () => {
  let db;
  let app;
  let alice;
  let bob;
  let aliceAnalysis;

  beforeAll(async () => {
    db = await startMemoryDb();
    app = buildApp();
  });

  beforeEach(async () => {
    await db.clear();
    alice = await User.create({ name: 'Alice', email: 'alice@example.com', password: 'alice-password' });
    bob = await User.create({ name: 'Bob', email: 'bob@example.com', password: 'bob-password' });
    aliceAnalysis = await Analysis.create({
      userId: alice._id,
      mode: 'resume_only',
      resume: { kind: 'paste', textHash: 'a'.repeat(64) },
      summary: { resumeHealth: { score: 70 } },
      versions: { schema: '1' },
      result: { marker: 'alice-only' },
    });
  });

  afterAll(async () => { await db.stop(); });

  describe('findOwnedById (repository helper used by every owned resource)', () => {
    it('returns the document only to its owner', async () => {
      const owned = await findOwnedById(Analysis, { userId: String(alice._id), id: String(aliceAnalysis._id) });
      expect(String(owned._id)).toBe(String(aliceAnalysis._id));
      expect(await findOwnedById(Analysis, { userId: String(bob._id), id: String(aliceAnalysis._id) })).toBeNull();
    });

    it('treats malformed ids as "not found" instead of throwing', async () => {
      expect(await findOwnedById(Analysis, { userId: String(alice._id), id: 'not-an-id' })).toBeNull();
      expect(await findOwnedById(Analysis, { userId: 'not-an-id', id: String(aliceAnalysis._id) })).toBeNull();
    });
  });

  describe('the removed V1/V2 API', () => {
    const REMOVED = [
      ['post', '/api/upload'],
      ['post', '/api/analyze'],
      ['get', '/api/analyze/health'],
      ['post', '/api/auth/login'],
      ['post', '/api/auth/signup'],
      ['get', '/api/auth/google'],
      ['get', '/api/resumes'],
      ['get', '/api/resumes/000000000000000000000000'],
      ['get', '/api/export/000000000000000000000000'],
      ['get', '/api/career/job-sets'],
      ['post', '/api/career/000000000000000000000000/interview-prep'],
    ];

    it.each(REMOVED)('%s %s is no longer registered', async (method, path) => {
      const login = await request(app).post('/api/v1/auth/login').send({ email: 'alice@example.com', password: 'alice-password' });
      const res = await request(app)[method](path).set('Authorization', `Bearer ${login.body.data.accessToken}`).send({});
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toMatch(/does not exist/);
    });

    it('only /api/health and /api/v1 are mounted', () => {
      const mounts = app._router.stack.filter((layer) => layer.name === 'router').map((layer) => String(layer.regexp));
      expect(mounts).toHaveLength(2);
      expect(mounts.some((m) => m.includes('health'))).toBe(true);
      expect(mounts.some((m) => m.includes('v1'))).toBe(true);
    });
  });
});
