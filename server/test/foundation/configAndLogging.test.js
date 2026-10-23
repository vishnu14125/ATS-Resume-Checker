const { loadConfig, ConfigError } = require('../../src/config/env');
const { createLogger } = require('../../src/shared/logger');

const STRONG_SECRET = 's'.repeat(40);

describe('Configuration', () => {
  it('applies safe defaults for local development', () => {
    const config = loadConfig({ JWT_SECRET: STRONG_SECRET });
    expect(config.env).toBe('development');
    expect(config.port).toBe(5000);
    expect(config.mongo.uri).toBe('mongodb://127.0.0.1:27017/ats_resume_checker');
    expect(config.auth.jwtExpiresIn).toBe('7d');
    expect(config.http.corsOrigins).toEqual(['http://localhost:5173']);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('fails fast when JWT_SECRET is missing', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/JWT_SECRET/);
  });

  it('requires MONGO_URI and a strong JWT_SECRET in production, without echoing the secret', () => {
    const weakSecret = 'weak-secret-value';
    let error;
    try {
      loadConfig({ NODE_ENV: 'production', JWT_SECRET: weakSecret });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.issues).toEqual(expect.arrayContaining([
      expect.stringMatching(/^MONGO_URI: required in production/),
      expect.stringMatching(/^JWT_SECRET: must be at least 32 characters/),
    ]));
    expect(error.message).not.toContain(weakSecret);
  });

  it('rejects the .env.example placeholder secret in production even though it is long enough', () => {
    const placeholder = 'replace-with-a-long-random-secret-of-32-plus-characters';
    const production = { NODE_ENV: 'production', MONGO_URI: 'mongodb://db.example/ats', TRUST_PROXY: '0' };
    expect(() => loadConfig({ ...production, JWT_SECRET: placeholder })).toThrow(/JWT_SECRET: still set to a placeholder/);
    expect(loadConfig({ ...production, JWT_SECRET: STRONG_SECRET }).isProduction).toBe(true);
    // AI stays optional in production: no provider settings are needed to start.
    expect(loadConfig({ ...production, JWT_SECRET: STRONG_SECRET }).ai.enabled).toBe(false);
  });

  it('only warns about a short secret outside production (existing local .env files keep working)', () => {
    const config = loadConfig({ JWT_SECRET: 'short-dev-secret' });
    expect(config.warnings).toEqual([expect.stringMatching(/shorter than 32 characters/)]);
  });

  it('rejects malformed numeric settings', () => {
    expect(() => loadConfig({ JWT_SECRET: STRONG_SECRET, PORT: 'eighty' })).toThrow(/PORT/);
    expect(() => loadConfig({ JWT_SECRET: STRONG_SECRET, AUTH_RATE_LIMIT_MAX: '0' })).toThrow(/AUTH_RATE_LIMIT_MAX/);
  });

  it('parses an explicit CORS allowlist', () => {
    const config = loadConfig({ JWT_SECRET: STRONG_SECRET, CORS_ORIGINS: 'https://a.example, https://b.example' });
    expect(config.http.corsOrigins).toEqual(['https://a.example', 'https://b.example']);
  });
});

describe('Structured logger', () => {
  it('writes JSON events and redacts sensitive keys at any depth', () => {
    const lines = [];
    const logger = createLogger({ level: 'info', write: (l) => lines.push(JSON.parse(l)) });
    logger.info('auth.test', {
      requestId: 'req-1',
      body: { email: 'jane@example.com', password: 'hunter22', nested: { resumeText: 'secret resume', token: 'abc' } },
      headers: { authorization: 'Bearer abc' },
    });
    expect(lines).toHaveLength(1);
    const [entry] = lines;
    expect(entry).toMatchObject({ level: 'info', event: 'auth.test', requestId: 'req-1' });
    expect(entry.body.email).toBe('[REDACTED]');
    expect(entry.body.password).toBe('[REDACTED]');
    expect(entry.body.nested.resumeText).toBe('[REDACTED]');
    expect(entry.body.nested.token).toBe('[REDACTED]');
    expect(entry.headers.authorization).toBe('[REDACTED]');
    expect(JSON.stringify(entry)).not.toMatch(/hunter22|secret resume|jane@example\.com/);
  });

  it('respects the configured level', () => {
    const lines = [];
    const logger = createLogger({ level: 'warn', write: (l) => lines.push(l) });
    logger.info('ignored');
    logger.warn('kept');
    expect(lines).toHaveLength(1);
  });
});
