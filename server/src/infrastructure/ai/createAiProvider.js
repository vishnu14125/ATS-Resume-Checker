const { AiProviderError } = require('../../application/ai/aiProvider');
const { createGeminiProvider } = require('./geminiProvider');
const { createOpenAiProvider } = require('./openaiProvider');

const FACTORIES = { gemini: createGeminiProvider, openai: createOpenAiProvider };
const DEFAULT_BACKOFF_MS = 400;

/**
 * Bounded retry for transient provider failures (rate limit, 5xx, network,
 * empty response). Timeouts, auth errors and rejected requests are not retried.
 */
function withRetry(provider, { maxRetries, backoffMs = DEFAULT_BACKOFF_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  return {
    name: provider.name,
    model: provider.model,
    async generateJson(request) {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await provider.generateJson(request);
        } catch (err) {
          const retry = err instanceof AiProviderError && err.retryable && attempt < maxRetries;
          if (!retry) throw err;
          await sleep(backoffMs * 2 ** attempt);
        }
      }
    },
  };
}

/**
 * Builds the configured AI provider, or returns null when AI is disabled
 * (no provider selected, or its key/model is missing). AI is optional: this
 * never throws for a missing configuration.
 *
 * @param {object} aiConfig  `config.ai` from loadConfig
 * @param {{ clients?: object, sleep?: Function }} [options]  SDK client overrides for tests
 */
function createAiProvider(aiConfig, { clients = {}, sleep } = {}) {
  if (!aiConfig || !aiConfig.enabled) return null;
  const factory = FACTORIES[aiConfig.provider];
  if (!factory) return null;
  const provider = factory({ apiKey: aiConfig.apiKey, model: aiConfig.model, timeoutMs: aiConfig.timeoutMs, client: clients[aiConfig.provider] });
  return withRetry(provider, { maxRetries: aiConfig.maxRetries, sleep });
}

module.exports = { createAiProvider, withRetry };
