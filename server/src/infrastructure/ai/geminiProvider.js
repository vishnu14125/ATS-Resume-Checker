const { AiProviderError } = require('../../application/ai/aiProvider');
const { withTimeout } = require('./providerErrors');

const NAME = 'gemini';

/**
 * Gemini adapter (@google/genai). Instructions go in `systemInstruction`, the
 * untrusted task input in `contents`, and the output is constrained with the
 * API's native JSON-schema response format.
 *
 * @param {{ apiKey: string, model: string, timeoutMs: number, client?: object }} options
 */
function createGeminiProvider({ apiKey, model, timeoutMs, client }) {
  // The SDK is loaded only when Gemini is actually configured.
  const ai = client || new (require('@google/genai').GoogleGenAI)({ apiKey });

  return {
    name: NAME,
    model,
    generateJson({ system, user, jsonSchema, maxOutputTokens }) {
      return withTimeout(timeoutMs, NAME, async (signal) => {
        const response = await ai.models.generateContent({
          model,
          contents: user,
          config: {
            systemInstruction: system,
            responseMimeType: 'application/json',
            responseJsonSchema: jsonSchema,
            maxOutputTokens,
            temperature: 0.2,
            abortSignal: signal,
            httpOptions: { timeout: timeoutMs },
          },
        });
        const text = response && response.text;
        if (typeof text !== 'string' || !text.trim()) throw new AiProviderError('empty', { provider: NAME });
        return text;
      });
    },
  };
}

module.exports = { createGeminiProvider };
