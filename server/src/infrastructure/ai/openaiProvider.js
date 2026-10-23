const { AiProviderError } = require('../../application/ai/aiProvider');
const { withTimeout } = require('./providerErrors');

const NAME = 'openai';

/**
 * OpenAI adapter (chat completions). Instructions are the system message, the
 * untrusted task input is the user message, and the output is constrained with
 * strict JSON-schema structured output. SDK retries are disabled; the retry
 * policy lives in one place (see createAiProvider).
 *
 * @param {{ apiKey: string, model: string, timeoutMs: number, client?: object }} options
 */
function createOpenAiProvider({ apiKey, model, timeoutMs, client }) {
  // The SDK is loaded only when OpenAI is actually configured.
  const openai = client || new (require('openai'))({ apiKey, maxRetries: 0, timeout: timeoutMs });

  return {
    name: NAME,
    model,
    generateJson({ system, user, schemaName, jsonSchema, maxOutputTokens }) {
      return withTimeout(timeoutMs, NAME, async (signal) => {
        const completion = await openai.chat.completions.create(
          {
            model,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
            response_format: { type: 'json_schema', json_schema: { name: schemaName, schema: jsonSchema, strict: true } },
            max_completion_tokens: maxOutputTokens,
          },
          { timeout: timeoutMs, maxRetries: 0, signal }
        );
        const message = completion && completion.choices && completion.choices[0] ? completion.choices[0].message : null;
        if (message && message.refusal) throw new AiProviderError('rejected', { provider: NAME });
        const text = message && message.content;
        if (typeof text !== 'string' || !text.trim()) throw new AiProviderError('empty', { provider: NAME });
        return text;
      });
    },
  };
}

module.exports = { createOpenAiProvider };
