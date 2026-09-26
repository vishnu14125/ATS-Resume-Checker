const GeminiProvider = require('./GeminiProvider');
const OpenAIProvider = require('./OpenAIProvider');

class AIFactory {
  static getProvider() {
    return this.getPrimaryProvider();
  }

  static isValidConfiguredApiKey(key) {
    if (!key || typeof key !== 'string') return false;
    
    const lowerKey = key.trim().toLowerCase();
    if (lowerKey === '') return false;
    
    const placeholders = [
      'your_openai_api_key_here',
      'your_openai_api_key',
      'your_openai_key_here',
      '<your_openai_api_key>',
      'sk-your-openai-api-key',
      'your_gemini_api_key',
      'your_gemini_key_here',
      'your_api_key'
    ];
    
    if (placeholders.some(p => lowerKey.includes(p))) {
      return false;
    }
    
    return true;
  }

  static getPrimaryProvider() {
    const providerName = (process.env.PRIMARY_AI_PROVIDER || process.env.AI_PROVIDER || 'gemini').toLowerCase();

    if (providerName === 'openai') {
      if (!this.isValidConfiguredApiKey(process.env.OPENAI_API_KEY)) {
        console.warn('⚠️ OPENAI_API_KEY missing or invalid placeholder. Falling back primary to Gemini.');
        return new GeminiProvider();
      }
      return new OpenAIProvider();
    }
    
    return new GeminiProvider();
  }

  static getFallbackProvider() {
    const providerName = (process.env.FALLBACK_AI_PROVIDER || 'openai').toLowerCase();

    if (providerName === 'openai') {
      if (!this.isValidConfiguredApiKey(process.env.OPENAI_API_KEY)) {
        return null; // Explicitly return null if no real key configured
      }
      return new OpenAIProvider();
    } else if (providerName === 'gemini') {
      if (!this.isValidConfiguredApiKey(process.env.GEMINI_API_KEY)) {
        return null;
      }
      return new GeminiProvider();
    }
    
    return null;
  }
}

module.exports = AIFactory;
