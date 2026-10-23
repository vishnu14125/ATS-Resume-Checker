const { z } = require('zod/v4');

const DEV_MONGO_URI = 'mongodb://127.0.0.1:27017/ats_resume_checker';
const MIN_PRODUCTION_SECRET_LENGTH = 32;

class ConfigError extends Error {
  constructor(issues) {
    super(`Invalid configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

const positiveInt = (fallback) => z.coerce.number().int().positive().default(fallback);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGO_URI: z.string().trim().min(1).optional(),
  MONGO_SERVER_SELECTION_TIMEOUT_MS: positiveInt(10000),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().trim().min(1).default('7d'),
  CLIENT_URL: z.string().trim().min(1).default('http://localhost:5173'),
  CORS_ORIGINS: z.string().trim().optional(),
  // Number of reverse proxies in front of the server. Rate limits key on the client IP that
  // Express derives from X-Forwarded-For through this many trusted hops; 0 ignores the header.
  // Unset means 0 outside production; production requires an explicit value (see loadConfig).
  TRUST_PROXY: z.coerce.number().int().min(0).optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).optional(),
  RATE_LIMIT_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RATE_LIMIT_MAX: positiveInt(500),
  AUTH_RATE_LIMIT_WINDOW_MS: positiveInt(15 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX: positiveInt(10),
  ANALYSIS_RATE_LIMIT_WINDOW_MS: positiveInt(15 * 60 * 1000),
  ANALYSIS_RATE_LIMIT_MAX: positiveInt(30),
  JSON_BODY_LIMIT: z.string().trim().min(1).default('10mb'),
  // AI is optional. Nothing here is required for the server to start.
  AI_PROVIDER: z.string().trim().toLowerCase().optional(),
  AI_MODEL: z.string().trim().optional(),
  GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_MODEL: z.string().trim().optional(),
  OPENAI_API_KEY: z.string().trim().optional(),
  OPENAI_MODEL: z.string().trim().optional(),
  AI_TIMEOUT_MS: positiveInt(20000),
  AI_MAX_OUTPUT_TOKENS: positiveInt(4096),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1),
  AI_RATE_LIMIT_WINDOW_MS: positiveInt(15 * 60 * 1000),
  AI_RATE_LIMIT_MAX: positiveInt(30),
});

const AI_PROVIDERS = Object.freeze({
  gemini: { keyVar: 'GEMINI_API_KEY', modelVar: 'GEMINI_MODEL' },
  openai: { keyVar: 'OPENAI_API_KEY', modelVar: 'OPENAI_MODEL' },
});

/** A key that is absent or still a template placeholder is treated as not configured. */
const PLACEHOLDER = /^<|your[_-]|api[_-]?key[_-]?here|change[_-]?me|replace[_-]/i;
const isRealKey = (key) => Boolean(key) && !PLACEHOLDER.test(key);

/**
 * Resolves the AI settings. AI is an optional edge service, so an incomplete
 * configuration disables it with a warning instead of failing startup.
 */
function resolveAiConfig(e, warnings) {
  const limits = { timeoutMs: e.AI_TIMEOUT_MS, maxOutputTokens: e.AI_MAX_OUTPUT_TOKENS, maxRetries: e.AI_MAX_RETRIES };
  const disabled = (disabledReason, warning) => {
    if (warning) warnings.push(`${warning} AI features are disabled.`);
    return Object.freeze({ enabled: false, provider: null, model: null, apiKey: null, disabledReason, ...limits });
  };

  const provider = e.AI_PROVIDER;
  if (!provider || provider === 'none') return disabled('not_configured');
  const definition = AI_PROVIDERS[provider];
  if (!definition) return disabled('unsupported_provider', `AI_PROVIDER "${provider}" is not supported (use gemini, openai or none).`);

  const apiKey = e[definition.keyVar];
  if (!isRealKey(apiKey)) return disabled('missing_api_key', `AI_PROVIDER is "${provider}" but ${definition.keyVar} is not set.`);
  const model = e.AI_MODEL || e[definition.modelVar];
  if (!model) return disabled('missing_model', `AI_PROVIDER is "${provider}" but no model is configured (set AI_MODEL).`);

  return Object.freeze({ enabled: true, provider, model, apiKey, disabledReason: null, ...limits });
}

/**
 * Builds the typed, frozen application config from environment variables.
 * Throws ConfigError listing every problem. Secret values are never echoed.
 */
function loadConfig(env = process.env) {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`));
  }
  const e = parsed.data;
  const issues = [];
  const isProduction = e.NODE_ENV === 'production';

  if (isProduction && !e.MONGO_URI) issues.push('MONGO_URI: required in production');
  if (isProduction && e.JWT_SECRET.length < MIN_PRODUCTION_SECRET_LENGTH) {
    issues.push(`JWT_SECRET: must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production`);
  } else if (isProduction && PLACEHOLDER.test(e.JWT_SECRET)) {
    // Long enough, but still the value copied from .env.example: anyone could forge tokens.
    issues.push('JWT_SECRET: still set to a placeholder value; generate a random secret for production');
  }
  // Trusting a hop that does not exist lets clients pick their own rate-limit key with a
  // spoofed X-Forwarded-For; trusting too few makes every user share the proxy's key. Only
  // the deployment knows the topology, so production must state it.
  const trustProxySet = env.TRUST_PROXY !== undefined && String(env.TRUST_PROXY).trim() !== '';
  if (isProduction && !trustProxySet) {
    issues.push('TRUST_PROXY: required in production; set it to the number of reverse proxies in front of the server (0 if clients connect directly)');
  }
  if (issues.length) throw new ConfigError(issues);

  const corsOrigins = (e.CORS_ORIGINS || e.CLIENT_URL)
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const warnings = [];
  if (!isProduction && e.JWT_SECRET.length < MIN_PRODUCTION_SECRET_LENGTH) {
    warnings.push(`JWT_SECRET is shorter than ${MIN_PRODUCTION_SECRET_LENGTH} characters; this would be rejected in production`);
  }
  const ai = resolveAiConfig(e, warnings);

  return Object.freeze({
    env: e.NODE_ENV,
    isProduction,
    isTest: e.NODE_ENV === 'test',
    port: e.PORT,
    mongo: Object.freeze({
      uri: e.MONGO_URI || DEV_MONGO_URI,
      serverSelectionTimeoutMs: e.MONGO_SERVER_SELECTION_TIMEOUT_MS,
    }),
    auth: Object.freeze({ jwtSecret: e.JWT_SECRET, jwtExpiresIn: e.JWT_EXPIRES_IN }),
    http: Object.freeze({
      corsOrigins: Object.freeze(corsOrigins),
      trustProxy: e.TRUST_PROXY ?? 0,
      jsonBodyLimit: e.JSON_BODY_LIMIT,
    }),
    rateLimits: Object.freeze({
      global: Object.freeze({ windowMs: e.RATE_LIMIT_WINDOW_MS, max: e.RATE_LIMIT_MAX }),
      auth: Object.freeze({ windowMs: e.AUTH_RATE_LIMIT_WINDOW_MS, max: e.AUTH_RATE_LIMIT_MAX }),
      analysis: Object.freeze({ windowMs: e.ANALYSIS_RATE_LIMIT_WINDOW_MS, max: e.ANALYSIS_RATE_LIMIT_MAX }),
      ai: Object.freeze({ windowMs: e.AI_RATE_LIMIT_WINDOW_MS, max: e.AI_RATE_LIMIT_MAX }),
    }),
    ai,
    logLevel: e.LOG_LEVEL || (e.NODE_ENV === 'test' ? 'silent' : 'info'),
    warnings: Object.freeze(warnings),
  });
}

module.exports = { loadConfig, ConfigError, EnvSchema };
