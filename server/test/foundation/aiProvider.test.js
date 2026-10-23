const { loadConfig } = require('../../src/config/env');
const { createAiProvider, withRetry } = require('../../src/infrastructure/ai/createAiProvider');
const { createGeminiProvider } = require('../../src/infrastructure/ai/geminiProvider');
const { createOpenAiProvider } = require('../../src/infrastructure/ai/openaiProvider');
const { AiProviderError } = require('../../src/application/ai/aiProvider');

const BASE_ENV = { NODE_ENV: 'test', JWT_SECRET: 'provider-test-secret-0123456789abcdef-xyz' };
const SECRET_KEY = 'TEST_API_KEY_NOT_REAL';
const config = (env) => loadConfig({ ...BASE_ENV, ...env });

const REQUEST = {
  system: 'SYSTEM RULES',
  user: '<task_input>\n{"facts":1}\n</task_input>',
  schemaName: 'resume_explanation',
  jsonSchema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false },
  maxOutputTokens: 512,
};

const geminiClient = (impl) => ({ models: { generateContent: jest.fn(impl) } });
const openaiClient = (impl) => ({ chat: { completions: { create: jest.fn(impl) } } });
const httpError = (status, message = `upstream said no (key=${SECRET_KEY})`) => Object.assign(new Error(message), { status });
const rejection = async (promise) => { try { await promise; } catch (err) { return err; } throw new Error('expected a rejection'); };

describe('AI configuration', () => {
  it('is disabled, without warnings, when no provider is configured', () => {
    const { ai, warnings } = config({});
    expect(ai).toMatchObject({ enabled: false, provider: null, model: null, apiKey: null, disabledReason: 'not_configured' });
    expect(warnings).toEqual([]);
    expect(config({ AI_PROVIDER: 'none', GEMINI_API_KEY: SECRET_KEY }).ai.enabled).toBe(false);
  });

  it('selects the configured provider and model', () => {
    expect(config({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: SECRET_KEY, AI_MODEL: 'model-a' }).ai)
      .toMatchObject({ enabled: true, provider: 'gemini', model: 'model-a', apiKey: SECRET_KEY, disabledReason: null });
    expect(config({ AI_PROVIDER: 'OpenAI', OPENAI_API_KEY: SECRET_KEY, OPENAI_MODEL: 'model-b' }).ai)
      .toMatchObject({ enabled: true, provider: 'openai', model: 'model-b' });
    expect(config({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: SECRET_KEY, GEMINI_MODEL: 'model-c', AI_MODEL: 'model-d' }).ai.model).toBe('model-d');
    expect(config({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: SECRET_KEY, AI_MODEL: 'm', AI_TIMEOUT_MS: '5000', AI_MAX_RETRIES: '0' }).ai)
      .toMatchObject({ timeoutMs: 5000, maxRetries: 0 });
  });

  it('never fails startup for incomplete AI settings: it disables AI and warns', () => {
    const cases = [
      [{ AI_PROVIDER: 'gemini' }, 'missing_api_key', /GEMINI_API_KEY is not set/],
      [{ AI_PROVIDER: 'gemini', GEMINI_API_KEY: '' }, 'missing_api_key', /GEMINI_API_KEY is not set/],
      [{ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'your_gemini_api_key' }, 'missing_api_key', /not set/],
      [{ AI_PROVIDER: 'openai', GEMINI_API_KEY: SECRET_KEY }, 'missing_api_key', /OPENAI_API_KEY is not set/],
      [{ AI_PROVIDER: 'gemini', GEMINI_API_KEY: SECRET_KEY }, 'missing_model', /no model is configured/],
      [{ AI_PROVIDER: 'groq', GROQ_API_KEY: SECRET_KEY }, 'unsupported_provider', /"groq" is not supported/],
    ];
    for (const [env, reason, warning] of cases) {
      const loaded = config(env);
      expect(loaded.ai).toMatchObject({ enabled: false, disabledReason: reason });
      expect(loaded.warnings).toEqual([expect.stringMatching(warning)]);
      expect(loaded.warnings.join(' ')).not.toContain(SECRET_KEY);
    }
  });
});

describe('Provider selection', () => {
  it('returns null when AI is disabled', () => {
    expect(createAiProvider(config({}).ai)).toBeNull();
    expect(createAiProvider(config({ AI_PROVIDER: 'gemini' }).ai)).toBeNull();
    expect(createAiProvider(undefined)).toBeNull();
  });

  it('builds the selected provider and exposes only its name and model', async () => {
    const gemini = createAiProvider(config({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: SECRET_KEY, AI_MODEL: 'g-model' }).ai, { clients: { gemini: geminiClient(async () => ({ text: '{}' })) } });
    const openai = createAiProvider(config({ AI_PROVIDER: 'openai', OPENAI_API_KEY: SECRET_KEY, AI_MODEL: 'o-model' }).ai, { clients: { openai: openaiClient(async () => ({ choices: [{ message: { content: '{}' } }] })) } });
    expect([gemini.name, gemini.model]).toEqual(['gemini', 'g-model']);
    expect([openai.name, openai.model]).toEqual(['openai', 'o-model']);
    expect(Object.keys(gemini).sort()).toEqual(['generateJson', 'model', 'name']);
    expect(JSON.stringify(gemini) + JSON.stringify(openai)).not.toContain(SECRET_KEY);
    expect(await gemini.generateJson(REQUEST)).toBe('{}');
    expect(await openai.generateJson(REQUEST)).toBe('{}');
  });
});

describe('Gemini adapter', () => {
  it('keeps instructions and task input separate and requests schema-constrained JSON', async () => {
    const client = geminiClient(async () => ({ text: '{"summary":"ok"}' }));
    const provider = createGeminiProvider({ apiKey: SECRET_KEY, model: 'g-model', timeoutMs: 1000, client });
    expect(await provider.generateJson(REQUEST)).toBe('{"summary":"ok"}');

    const [call] = client.models.generateContent.mock.calls[0];
    expect(call.model).toBe('g-model');
    expect(call.contents).toBe(REQUEST.user);
    expect(call.contents).not.toContain('SYSTEM RULES');
    expect(call.config).toMatchObject({
      systemInstruction: 'SYSTEM RULES', responseMimeType: 'application/json', responseJsonSchema: REQUEST.jsonSchema,
      maxOutputTokens: 512, httpOptions: { timeout: 1000 },
    });
    expect(call.config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(call)).not.toContain(SECRET_KEY);
  });

  it('treats an empty response as a provider error', async () => {
    for (const response of [{ text: '' }, { text: '   ' }, {}, null]) {
      const provider = createGeminiProvider({ apiKey: SECRET_KEY, model: 'm', timeoutMs: 1000, client: geminiClient(async () => response) });
      expect(await rejection(provider.generateJson(REQUEST))).toMatchObject({ name: 'AiProviderError', kind: 'empty', provider: 'gemini' });
    }
  });
});

describe('OpenAI adapter', () => {
  it('sends system and user as separate messages with strict JSON-schema output and no SDK retries', async () => {
    const client = openaiClient(async () => ({ choices: [{ message: { content: '{"summary":"ok"}' } }] }));
    const provider = createOpenAiProvider({ apiKey: SECRET_KEY, model: 'o-model', timeoutMs: 1000, client });
    expect(await provider.generateJson(REQUEST)).toBe('{"summary":"ok"}');

    const [body, options] = client.chat.completions.create.mock.calls[0];
    expect(body.model).toBe('o-model');
    expect(body.messages).toEqual([{ role: 'system', content: 'SYSTEM RULES' }, { role: 'user', content: REQUEST.user }]);
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'resume_explanation', schema: REQUEST.jsonSchema, strict: true } });
    expect(body.max_completion_tokens).toBe(512);
    expect(options).toMatchObject({ timeout: 1000, maxRetries: 0 });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps a refusal and an empty message to provider errors', async () => {
    const refusal = createOpenAiProvider({ apiKey: SECRET_KEY, model: 'm', timeoutMs: 1000, client: openaiClient(async () => ({ choices: [{ message: { refusal: 'no', content: null } }] })) });
    expect((await rejection(refusal.generateJson(REQUEST))).kind).toBe('rejected');
    const empty = createOpenAiProvider({ apiKey: SECRET_KEY, model: 'm', timeoutMs: 1000, client: openaiClient(async () => ({ choices: [] })) });
    expect((await rejection(empty.generateJson(REQUEST))).kind).toBe('empty');
  });
});

describe('Provider error mapping', () => {
  const failing = (error) => createGeminiProvider({ apiKey: SECRET_KEY, model: 'm', timeoutMs: 1000, client: geminiClient(async () => { throw error; }) });

  it.each([
    [500, 'unavailable', true], [503, 'unavailable', true], [429, 'rate_limited', true],
    [401, 'auth', false], [403, 'auth', false], [400, 'rejected', false], [404, 'rejected', false], [504, 'timeout', false],
  ])('HTTP %i → %s', async (status, kind, retryable) => {
    const err = await rejection(failing(httpError(status)).generateJson(REQUEST));
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err).toMatchObject({ kind, status, retryable, provider: 'gemini' });
  });

  it('maps network failures to "unavailable" and SDK timeouts to "timeout"', async () => {
    expect((await rejection(failing(new TypeError('fetch failed')).generateJson(REQUEST))).kind).toBe('unavailable');
    expect((await rejection(failing(Object.assign(new Error('x'), { name: 'APIConnectionTimeoutError' })).generateJson(REQUEST))).kind).toBe('timeout');
    expect((await rejection(failing(Object.assign(new Error('x'), { name: 'AbortError' })).generateJson(REQUEST))).kind).toBe('timeout');
  });

  it('never copies the upstream message (which may contain a key or request content) into its own', async () => {
    const err = await rejection(failing(httpError(500)).generateJson(REQUEST));
    expect(err.message).toBe('AI provider error: unavailable (HTTP 500)');
    expect(err.message).not.toContain(SECRET_KEY);
  });

  it('enforces the timeout even if the SDK ignores the abort signal', async () => {
    let signal;
    const client = geminiClient((req) => { signal = req.config.abortSignal; return new Promise(() => {}); }); // never settles
    const provider = createGeminiProvider({ apiKey: SECRET_KEY, model: 'm', timeoutMs: 25, client });
    const started = Date.now();
    const err = await rejection(provider.generateJson(REQUEST));
    expect(err).toMatchObject({ kind: 'timeout', retryable: false });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(signal.aborted).toBe(true);
  });
});

describe('Retry policy', () => {
  const scripted = (...outcomes) => {
    const queue = [...outcomes];
    const provider = { name: 'gemini', model: 'm', generateJson: jest.fn(async () => { const next = queue.shift(); if (next instanceof Error) throw next; return next; }) };
    const sleep = jest.fn(async () => {});
    return { provider, sleep };
  };
  const transient = (kind) => new AiProviderError(kind, { provider: 'gemini' });

  it('retries a transient failure once and succeeds', async () => {
    const { provider, sleep } = scripted(transient('unavailable'), '{"ok":true}');
    expect(await withRetry(provider, { maxRetries: 1, sleep }).generateJson(REQUEST)).toBe('{"ok":true}');
    expect(provider.generateJson).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('gives up after the configured number of retries (no infinite retry)', async () => {
    const { provider, sleep } = scripted(transient('rate_limited'), transient('rate_limited'), transient('rate_limited'), '{"never":"reached"}');
    const err = await rejection(withRetry(provider, { maxRetries: 2, sleep }).generateJson(REQUEST));
    expect(err.kind).toBe('rate_limited');
    expect(provider.generateJson).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([400, 800]); // bounded exponential backoff
  });

  it.each(['timeout', 'auth', 'rejected'])('does not retry "%s"', async (kind) => {
    const { provider, sleep } = scripted(transient(kind), '{"never":"reached"}');
    expect((await rejection(withRetry(provider, { maxRetries: 2, sleep }).generateJson(REQUEST))).kind).toBe(kind);
    expect(provider.generateJson).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('makes exactly one attempt when retries are disabled', async () => {
    const { provider, sleep } = scripted(transient('unavailable'), '{"never":"reached"}');
    await rejection(withRetry(provider, { maxRetries: 0, sleep }).generateJson(REQUEST));
    expect(provider.generateJson).toHaveBeenCalledTimes(1);
  });

  it('applies the configured retry limit to a provider built from config', async () => {
    const client = geminiClient(async () => { throw httpError(503); });
    const provider = createAiProvider(config({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: SECRET_KEY, AI_MODEL: 'm', AI_MAX_RETRIES: '1' }).ai, { clients: { gemini: client }, sleep: async () => {} });
    expect((await rejection(provider.generateJson(REQUEST))).kind).toBe('unavailable');
    expect(client.models.generateContent).toHaveBeenCalledTimes(2);
  });
});
