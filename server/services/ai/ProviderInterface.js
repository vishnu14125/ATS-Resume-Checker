class ProviderInterface {
  /**
   * Generates a structured JSON object adhering to the provided Zod schema.
   * @param {string} prompt - The system/user instructions
   * @param {string} text - The source text to extract from
   * @param {object} zodSchema - The Zod schema to enforce
   * @returns {Promise<object>} The validated JSON object
   */
  async generateStructuredOutput(prompt, text, zodSchema) {
    throw new Error('Method not implemented.');
  }

  /**
   * Optional capability if the provider offers embeddings (like OpenAI)
   * Otherwise falls back to the embeddingService.
   */
  async generateEmbedding(text) {
    throw new Error('Method not implemented.');
  }
}

module.exports = ProviderInterface;
