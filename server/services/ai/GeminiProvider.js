const ProviderInterface = require('./ProviderInterface');
const { GoogleGenAI } = require('@google/genai');

class GeminiProvider extends ProviderInterface {
  constructor() {
    super();
    // Using @google/genai v0.1.1 SDK
    // It automatically picks up GEMINI_API_KEY from environment variables
    this.ai = new GoogleGenAI();
    this.modelName = process.env.GEMINI_MODEL || process.env.AI_REASONING_MODEL || 'gemini-3.8-flash';
  }

  // Convert Zod schema to subset of JSON Schema expected by Gemini structured output
  _zodToJsonSchema(zodSchema) {
    // We use a basic dynamic mapping or fallback to standard json schema if zod-to-json-schema is installed.
    // For simplicity, we can rely on standard JSON response from gemini and validate with Zod locally.
    // However, Gemini 1.5+ supports `responseSchema`.
    // Let's use simple prompt injection for schema + strict Zod validation on our end for reliability.
    return zodSchema;
  }

  async generateStructuredOutput(prompt, text, zodSchema) {
    try {
      const fullPrompt = `
${prompt}

IMPORTANT: You MUST return a valid JSON object. Do NOT include markdown code blocks like \`\`\`json. Return ONLY the raw JSON object.
Do NOT hallucinate information. If data is not present in the text, use null or empty arrays as appropriate.

Source Text:
${text}
`;

      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: fullPrompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      });

      const rawText = response.text;
      
      let parsedJson;
      try {
        parsedJson = JSON.parse(rawText);
      } catch (e) {
        // Fallback: Attempt to strip markdown if the model ignored instructions
        const stripped = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        parsedJson = JSON.parse(stripped);
      }

      // Validate against Zod schema
      const validated = zodSchema.parse(parsedJson);
      return validated;

    } catch (error) {
      console.error('Gemini Provider Error:', error);
      throw error;
    }
  }
}

module.exports = GeminiProvider;
