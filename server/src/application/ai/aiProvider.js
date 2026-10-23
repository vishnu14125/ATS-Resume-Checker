/**
 * The AI provider port. The application depends only on this shape; the Gemini
 * and OpenAI adapters in `infrastructure/ai` implement it.
 *
 * @typedef {object} AiProvider
 * @property {string} name   provider id, e.g. "gemini"
 * @property {string} model  configured model id
 * @property {(request: AiRequest) => Promise<string>} generateJson
 *   Resolves with the model's raw text (expected to be JSON; the caller parses
 *   and validates it). Rejects only with AiProviderError.
 *
 * @typedef {object} AiRequest
 * @property {string} system          instructions (trusted, static)
 * @property {string} user            task input (untrusted data, serialized)
 * @property {string} schemaName      name of the output schema
 * @property {object} jsonSchema      JSON Schema for native structured output
 * @property {number} maxOutputTokens
 */

const RETRYABLE = new Set(['rate_limited', 'unavailable', 'empty']);

/**
 * A normalized provider failure. `kind` is one of:
 *   timeout | rate_limited | unavailable | auth | rejected | empty
 * The message never contains credentials or request content.
 */
class AiProviderError extends Error {
  constructor(kind, { provider = null, status = null, cause } = {}) {
    super(`AI provider error: ${kind}${status ? ` (HTTP ${status})` : ''}`);
    this.name = 'AiProviderError';
    this.kind = kind;
    this.provider = provider;
    this.status = status;
    this.retryable = RETRYABLE.has(kind);
    if (cause) this.cause = cause;
  }
}

module.exports = { AiProviderError };
