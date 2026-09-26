const ProviderInterface = require('./ProviderInterface');
const OpenAI = require('openai');

class OpenAIProvider extends ProviderInterface {
  constructor() {
    super();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.modelName = process.env.AI_REASONING_MODEL || 'gpt-4o-mini';
  }

  async generateStructuredOutput(prompt, text, zodSchema) {
    try {
      const fullPrompt = `
${prompt}

Source Text:
${text}

IMPORTANT: Return ONLY a valid JSON object. Do not invent information. If information is missing, return null or empty array.
`;

      const completion = await this.openai.chat.completions.create({
        model: this.modelName,
        messages: [{ role: "user", content: fullPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.1
      });

      const rawText = completion.choices[0].message.content;
      const parsedJson = JSON.parse(rawText);
      
      // Validate against Zod schema
      const validated = zodSchema.parse(parsedJson);
      return validated;

    } catch (error) {
      console.error('OpenAI Provider Error:', error);
      throw error;
    }
  }

  async generateEmbedding(text) {
    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error('OpenAI Embedding Error:', error);
      throw error;
    }
  }
}

module.exports = OpenAIProvider;
