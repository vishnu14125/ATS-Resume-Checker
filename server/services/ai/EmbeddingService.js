const AIFactory = require('./AIFactory');

class EmbeddingService {
  constructor() {
    this.providerType = (process.env.EMBEDDING_PROVIDER || 'local').toLowerCase();
    
    // For lazy loading Transformers.js
    this.pipeline = null;
    this.env = null;
    this.localModel = process.env.LOCAL_EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
  }

  async _initLocal() {
    if (!this.pipeline) {
      const transformers = await import('@xenova/transformers');
      this.env = transformers.env;
      // Use local caching, disable remote fetching if you want purely offline, but default is fine
      this.pipeline = await transformers.pipeline('feature-extraction', this.localModel, {
        quantized: true
      });
    }
  }

  async generateEmbedding(text) {
    if (this.providerType === 'provider') {
      const provider = AIFactory.getProvider();
      if (provider.generateEmbedding) {
        return await provider.generateEmbedding(text);
      } else {
        console.warn('⚠️ Selected AI provider does not support generateEmbedding. Falling back to local.');
        this.providerType = 'local';
      }
    }

    if (this.providerType === 'local') {
      await this._initLocal();
      const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
      // Output is a Tensor. Convert to standard JS array.
      return Array.from(output.data);
    }
    
    throw new Error('Unsupported embedding provider');
  }

  async generateEmbeddings(texts) {
    // Basic implementation: process in parallel
    return await Promise.all(texts.map(t => this.generateEmbedding(t)));
  }

  similarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

module.exports = new EmbeddingService();
