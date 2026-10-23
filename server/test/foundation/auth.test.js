const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { startMemoryDb, buildApp, TEST_JWT_SECRET } = require('./helpers/testApp');
const User = require('../../src/infrastructure/db/models/User');

jest.setTimeout(60000);

describe('Authentication (/api/v1/auth, /api/v1/me)', () => {
  let db;
  let app;

  beforeAll(async () => {
    db = await startMemoryDb();
    app = buildApp();
  });

  afterEach(() => db.clear());

  afterAll(async () => { await db.stop(); });

  const register = (body) => request(app).post('/api/v1/auth/register').send(body);
  const login = (body) => request(app).post('/api/v1/auth/login').send(body);

  describe('register', () => {
    it('creates a user with a hashed password, normalized email and a working token', async () => {
      const res = await register({ name: '  Jane Doe ', email: '  Jane.Doe@Example.COM ', password: 'correct horse battery' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toEqual({ id: expect.stringMatching(/^[a-f\d]{24}$/), name: 'Jane Doe', email: 'jane.doe@example.com', createdAt: expect.any(String) });
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);

      const stored = await User.findById(res.body.data.user.id);
      expect(stored.email).toBe('jane.doe@example.com');
      expect(stored.password).not.toBe('correct horse battery');
      expect(await bcrypt.compare('correct horse battery', stored.password)).toBe(true);

      const me = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${res.body.data.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.data.user.id).toBe(res.body.data.user.id);
    });

    it('rejects a duplicate email regardless of case with 409 EMAIL_TAKEN', async () => {
      await register({ name: 'A', email: 'dup@example.com', password: 'password-one' });
      const res = await register({ name: 'B', email: 'DUP@example.com', password: 'password-two' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_TAKEN');
      expect(await User.countDocuments()).toBe(1);
    });

    it('detects duplicates against accounts stored with mixed-case emails', async () => {
      await User.create({ name: 'Legacy', email: 'Legacy.User@Example.com', password: 'legacy-password' });
      const res = await register({ name: 'New', email: 'legacy.user@example.com', password: 'another-password' });
      expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });
  });

  describe('login', () => {
    beforeEach(() => register({ name: 'Jane', email: 'jane@example.com', password: 'correct horse battery' }));

    it('returns a token for valid credentials, matching the email case-insensitively', async () => {
      const res = await login({ email: 'JANE@example.com', password: 'correct horse battery' });
      expect(res.status).toBe(200);
      const payload = jwt.verify(res.body.data.accessToken, TEST_JWT_SECRET);
      expect(payload.id).toBe(res.body.data.user.id);
    });

    it('returns the same 401 INVALID_CREDENTIALS for a wrong password and an unknown email', async () => {
      const wrongPassword = await login({ email: 'jane@example.com', password: 'wrong password' });
      const unknownEmail = await login({ email: 'nobody@example.com', password: 'whatever' });
      for (const res of [wrongPassword, unknownEmail]) {
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      }
      expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
    });

    it('lets accounts stored with mixed-case emails log in', async () => {
      await User.create({ name: 'Legacy', email: 'Old.Account@Example.com', password: 'legacy-password' });
      const res = await login({ email: 'old.account@example.com', password: 'legacy-password' });
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('Old.Account@Example.com');
    });

    it('rate limits repeated attempts with a 429 RATE_LIMITED envelope', async () => {
      const limited = buildApp({ env: { AUTH_RATE_LIMIT_MAX: '3' } });
      const attempt = () => request(limited).post('/api/v1/auth/login').send({ email: 'jane@example.com', password: 'wrong password' });
      for (let i = 0; i < 3; i += 1) expect((await attempt()).status).toBe(401);
      const blocked = await attempt();
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('token verification on /api/v1/me', () => {
    let user;
    beforeEach(async () => {
      user = await User.create({ name: 'Token User', email: 'token@example.com', password: 'token-password' });
    });

    const me = (token) => request(app).get('/api/v1/me').set('Authorization', `Bearer ${token}`);

    it('rejects an expired token with TOKEN_EXPIRED', async () => {
      const expired = jwt.sign({ id: String(user._id), email: user.email }, TEST_JWT_SECRET, { expiresIn: -10 });
      const res = await me(expired);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('rejects tokens signed with another secret, malformed tokens and the "none" algorithm', async () => {
      const forged = jwt.sign({ id: String(user._id) }, 'attacker-secret');
      const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ id: String(user._id) })).toString('base64url')}.`;
      for (const token of [forged, 'not.a.jwt', unsigned]) {
        const res = await me(token);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
      }
    });

    it('rejects a valid token whose payload has no usable user id', async () => {
      const res = await me(jwt.sign({ email: 'x@example.com' }, TEST_JWT_SECRET));
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects a token for an account that no longer exists', async () => {
      const token = jwt.sign({ id: String(user._id), email: user.email }, TEST_JWT_SECRET);
      await User.deleteOne({ _id: user._id });
      const res = await me(token);
      expect(res.status).toBe(401);
      expect(res.body.error.message).toMatch(/no longer exists/);
    });
  });

});
