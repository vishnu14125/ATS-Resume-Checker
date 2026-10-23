const express = require('express');
const request = require('supertest');
const { buildApp, createCaptureLogger } = require('./helpers/testApp');
const { requestContext } = require('../../src/api/middleware/requestContext');
const { createErrorHandler } = require('../../src/api/middleware/errorHandler');
const { AppError } = require('../../src/shared/errors');

/** Every error response must use the canonical envelope and carry the request id. */
function expectErrorEnvelope(res, status, code) {
  expect(res.status).toBe(status);
  expect(res.body.success).toBe(false);
  expect(res.body.error.code).toBe(code);
  expect(typeof res.body.error.message).toBe('string');
  expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  expect(res.body.error).not.toHaveProperty('stack');
}

describe('/api/v1 conventions (no database required)', () => {
  const app = buildApp();

  it('rejects malformed JSON with a VALIDATION_ERROR envelope', async () => {
    const res = await request(app).post('/api/v1/auth/register').set('Content-Type', 'application/json').send('{"name": ');
    expectErrorEnvelope(res, 400, 'VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/not valid JSON/);
  });

  it('reports every invalid field with its path, and rejects unknown fields (no mass assignment)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: '', email: 'not-an-email', password: 'short', isAdmin: true });
    expectErrorEnvelope(res, 400, 'VALIDATION_ERROR');
    const paths = res.body.error.details.issues.map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['body.name', 'body.email', 'body.password', 'body']));
    const unknownKey = res.body.error.details.issues.find((i) => i.code === 'unrecognized_keys');
    expect(unknownKey.message).toMatch(/isAdmin/);
  });

  it('rejects passwords longer than bcrypt can hash (72 bytes) instead of silently truncating', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'A', email: 'a@example.com', password: 'é'.repeat(40) }); // 80 bytes, 40 characters
    expectErrorEnvelope(res, 400, 'VALIDATION_ERROR');
    expect(res.body.error.details.issues[0].message).toMatch(/72 bytes/);
  });

  it('returns NOT_FOUND envelopes for unknown v1 routes and unknown API routes', async () => {
    expectErrorEnvelope(await request(app).get('/api/v1/does-not-exist'), 404, 'NOT_FOUND');
    expectErrorEnvelope(await request(app).get('/api/nothing-here'), 404, 'NOT_FOUND');
  });

  it('echoes a well-formed X-Request-Id and replaces a malformed one', async () => {
    const good = await request(app).get('/api/v1/nope').set('X-Request-Id', 'client-req-12345');
    expect(good.headers['x-request-id']).toBe('client-req-12345');
    expect(good.body.error.requestId).toBe('client-req-12345');

    const bad = await request(app).get('/api/v1/nope').set('X-Request-Id', 'bad id <script>');
    expect(bad.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('requires a Bearer token on protected routes', async () => {
    expectErrorEnvelope(await request(app).get('/api/v1/me'), 401, 'UNAUTHENTICATED');
    const basic = await request(app).get('/api/v1/me').set('Authorization', 'Basic abc');
    expectErrorEnvelope(basic, 401, 'UNAUTHENTICATED');
    expect(basic.body.error.message).toMatch(/Bearer/);
  });

  it('returns 413 PAYLOAD_TOO_LARGE for bodies over the configured limit', async () => {
    const small = buildApp({ env: { JSON_BODY_LIMIT: '1kb' } });
    const res = await request(small).post('/api/v1/auth/login').send({ email: 'a@example.com', password: 'x'.repeat(5000) });
    expectErrorEnvelope(res, 413, 'PAYLOAD_TOO_LARGE');
  });

  it('serves /api/health and the live/ready probes', async () => {
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('OK');

    const live = await request(app).get('/api/health/live');
    expect(live.body).toEqual({ success: true, data: { status: 'live' } });

    const notReady = await request(buildApp({ overrides: { isDatabaseReady: () => false } })).get('/api/health/ready');
    expectErrorEnvelope(notReady, 503, 'NOT_READY');
    expect(notReady.body.error.details.checks.database).toBe('down');

    const ready = await request(buildApp({ overrides: { isDatabaseReady: () => true } })).get('/api/health/ready');
    expect(ready.body.data).toEqual({ status: 'ready', checks: { database: 'up' } });
  });
});

describe('Error handler', () => {
  function appThatThrows(error, { exposeDebug = false } = {}) {
    const { logger, lines } = createCaptureLogger();
    const app = express();
    app.use(requestContext(logger));
    app.get('/boom', (req, res, next) => next(error));
    app.use(createErrorHandler({ logger, exposeDebug }));
    return { app, lines };
  }

  it('hides unexpected errors from clients but logs them with the request id', async () => {
    const { app, lines } = appThatThrows(new Error('db password=hunter2 leaked in driver message'));
    const res = await request(app).get('/boom');
    expectErrorEnvelope(res, 500, 'INTERNAL_ERROR');
    expect(res.body.error.message).toBe('An unexpected error occurred.');
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2|stack/);

    const logged = lines.find((l) => l.event === 'http.error');
    expect(logged.requestId).toBe(res.body.error.requestId);
    expect(logged.error.message).toMatch(/driver message/);
  });

  it('includes debug details only when explicitly enabled (development)', async () => {
    const { app } = appThatThrows(new Error('visible in dev'), { exposeDebug: true });
    const res = await request(app).get('/boom');
    expect(res.body.error.debug.message).toBe('visible in dev');
  });

  it('maps AppErrors, errors with a 4xx status and malformed ObjectIds to stable codes', async () => {
    const conflict = await request(appThatThrows(new AppError('EMAIL_TAKEN')).app).get('/boom');
    expectErrorEnvelope(conflict, 409, 'EMAIL_TAKEN');

    const clientError = Object.assign(new Error('Invalid file type. Please upload a PDF or DOCX resume.'), { statusCode: 400 });
    const clientRes = await request(appThatThrows(clientError).app).get('/boom');
    expectErrorEnvelope(clientRes, 400, 'VALIDATION_ERROR');
    expect(clientRes.body.error.message).toBe('Invalid file type. Please upload a PDF or DOCX resume.');

    const cast = Object.assign(new Error('Cast to ObjectId failed'), { name: 'CastError', kind: 'ObjectId' });
    expectErrorEnvelope(await request(appThatThrows(cast).app).get('/boom'), 404, 'NOT_FOUND');
  });
});
