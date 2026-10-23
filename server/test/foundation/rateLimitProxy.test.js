const request = require('supertest');
const { startMemoryDb, buildApp } = require('./helpers/testApp');
const { loadConfig, ConfigError } = require('../../src/config/env');
const User = require('../../src/infrastructure/db/models/User');

jest.setTimeout(60000);

const STRONG_SECRET = 's'.repeat(40);
const PRODUCTION = { NODE_ENV: 'production', MONGO_URI: 'mongodb://db.example/ats', JWT_SECRET: STRONG_SECRET };
const LIMIT = 3;

describe('Client IP trust for rate limits (TRUST_PROXY)', () => {
  describe('configuration', () => {
    it('trusts no proxy hops unless configured', () => {
      expect(loadConfig({ JWT_SECRET: STRONG_SECRET }).http.trustProxy).toBe(0);
      expect(loadConfig({ JWT_SECRET: STRONG_SECRET, TRUST_PROXY: '2' }).http.trustProxy).toBe(2);
    });

    it('requires an explicit TRUST_PROXY in production, including an explicit 0', () => {
      for (const env of [PRODUCTION, { ...PRODUCTION, TRUST_PROXY: '' }, { ...PRODUCTION, TRUST_PROXY: '  ' }]) {
        let error;
        try { loadConfig(env); } catch (err) { error = err; }
        expect(error).toBeInstanceOf(ConfigError);
        expect(error.issues).toEqual(expect.arrayContaining([expect.stringMatching(/^TRUST_PROXY: required in production/)]));
      }
      expect(loadConfig({ ...PRODUCTION, TRUST_PROXY: '0' }).http.trustProxy).toBe(0);
      expect(loadConfig({ ...PRODUCTION, TRUST_PROXY: '1' }).http.trustProxy).toBe(1);
    });

    it('rejects negative or non-numeric values', () => {
      expect(() => loadConfig({ JWT_SECRET: STRONG_SECRET, TRUST_PROXY: '-1' })).toThrow(/TRUST_PROXY/);
      expect(() => loadConfig({ JWT_SECRET: STRONG_SECRET, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
    });
  });

  describe('login throttling', () => {
    let db;

    beforeAll(async () => { db = await startMemoryDb(); });
    // Created directly so that setup does not consume the auth rate limit (register is limited too).
    beforeEach(() => User.create({ name: 'Jane', email: 'jane@example.com', password: 'correct horse battery' }));
    afterEach(() => db.clear());
    afterAll(async () => { await db.stop(); });

    // Each buildApp() call has its own in-memory limiter, so every test starts with a clean count.
    const limitedApp = (env = {}) => buildApp({ env: { AUTH_RATE_LIMIT_MAX: String(LIMIT), ...env } });
    const login = (app, xff, password = 'wrong password') => {
      const req = request(app).post('/api/v1/auth/login');
      if (xff) req.set('X-Forwarded-For', xff);
      return req.send({ email: 'jane@example.com', password });
    };

    it('blocks repeated failed logins from the same client', async () => {
      const app = limitedApp();
      for (let i = 0; i < LIMIT; i += 1) expect((await login(app)).status).toBe(401);
      const blocked = await login(app);
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('RATE_LIMITED');
    });

    it.each([
      ['TRUST_PROXY unset', {}],
      ['TRUST_PROXY=0', { TRUST_PROXY: '0' }],
    ])('ignores spoofed X-Forwarded-For values from a direct client (%s)', async (label, env) => {
      const app = limitedApp(env);
      for (let i = 0; i < LIMIT; i += 1) expect((await login(app, `203.0.113.${i + 1}`)).status).toBe(401);
      expect((await login(app, '203.0.113.200')).status).toBe(429);
      expect((await login(app, '198.51.100.1, 198.51.100.2')).status).toBe(429);
    });

    it('keeps the limit once reached, even for the correct password', async () => {
      const app = limitedApp();
      expect((await login(app, '203.0.113.1', 'correct horse battery')).status).toBe(200);
      for (let i = 1; i < LIMIT; i += 1) expect((await login(app, `203.0.113.${i + 1}`)).status).toBe(401);
      expect((await login(app, '203.0.113.99', 'correct horse battery')).status).toBe(429);
    });

    describe('behind one trusted proxy (TRUST_PROXY=1)', () => {
      // A real proxy appends the address it saw; entries to its left were supplied by the client.
      const viaProxy = (spoofed, client) => `${spoofed}, ${client}`;

      it('keys on the address appended by the proxy, not on client-supplied entries', async () => {
        const app = limitedApp({ TRUST_PROXY: '1' });
        for (let i = 0; i < LIMIT; i += 1) expect((await login(app, viaProxy(`203.0.113.${i + 1}`, '198.51.100.7'))).status).toBe(401);
        expect((await login(app, viaProxy('203.0.113.250', '198.51.100.7'))).status).toBe(429);
      });

      it('gives different real clients separate limits', async () => {
        const app = limitedApp({ TRUST_PROXY: '1' });
        for (let i = 0; i < LIMIT; i += 1) await login(app, viaProxy('203.0.113.1', '198.51.100.7'));
        expect((await login(app, viaProxy('203.0.113.1', '198.51.100.7'))).status).toBe(429);
        expect((await login(app, viaProxy('203.0.113.1', '198.51.100.8'))).status).toBe(401);
        expect((await login(app, viaProxy('203.0.113.1', '198.51.100.8'), 'correct horse battery')).status).toBe(200);
      });
    });
  });
});
