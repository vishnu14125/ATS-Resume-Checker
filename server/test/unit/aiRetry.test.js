const aiEngine = require('../../services/ai/AIEngine');
const { z } = require('zod');

describe('AIEngine Retry & Fallback Logic Unit Tests', () => {
  let originalPrimaryProvider;
  let originalFallbackProvider;
  let originalProvider;

  beforeEach(() => {
    originalPrimaryProvider = aiEngine.primaryProvider;
    originalFallbackProvider = aiEngine.fallbackProvider;
    originalProvider = aiEngine.provider;
  });

  afterEach(() => {
    aiEngine.primaryProvider = originalPrimaryProvider;
    aiEngine.fallbackProvider = originalFallbackProvider;
    aiEngine.provider = originalProvider;
  });

  // Gemini success
  it('Gemini success: should return on first valid response', async () => {
    aiEngine.provider = {
      constructor: { name: 'GeminiProvider' },
      generateStructuredOutput: jest.fn().mockResolvedValue({ success: true })
    };
    aiEngine.primaryProvider = aiEngine.provider;
    aiEngine.fallbackProvider = null;

    const result = await aiEngine._safeGenerate('prompt', 'text', z.object({}));
    expect(result.success).toBe(true);
    expect(aiEngine.provider.generateStructuredOutput).toHaveBeenCalledTimes(1);
  });

  // Gemini 503 -> retry -> success
  it('Gemini 503 -> retry -> success', async () => {
    let callCount = 0;
    aiEngine.provider = {
      constructor: { name: 'GeminiProvider' },
      generateStructuredOutput: jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          const err = new Error('503 Service Unavailable');
          err.status = 503;
          throw err;
        }
        return { success: true };
      })
    };
    aiEngine.primaryProvider = aiEngine.provider;
    aiEngine.fallbackProvider = null;
    
    const result = await aiEngine._safeGenerate('prompt', 'text', z.object({}));
    expect(result.success).toBe(true);
    expect(callCount).toBe(2);
  });

  // Gemini 503 -> retries exhausted -> OpenAI fallback IF key configured
  it('Gemini 503 -> retries exhausted -> OpenAI fallback IF key configured', async () => {
    aiEngine.provider = {
      constructor: { name: 'GeminiProvider' },
      generateStructuredOutput: jest.fn().mockImplementation(async () => {
        const err = new Error('503 Service Unavailable');
        err.status = 503;
        throw err;
      })
    };
    aiEngine.fallbackProvider = {
      constructor: { name: 'OpenAIProvider' },
      generateStructuredOutput: jest.fn().mockResolvedValue({ success: true, fromFallback: true })
    };
    aiEngine.primaryProvider = aiEngine.provider;
    
    const result = await aiEngine._safeGenerate('prompt', 'text', z.object({}), 2);
    expect(result.fromFallback).toBe(true);
    expect(aiEngine.provider.generateStructuredOutput).toHaveBeenCalledTimes(3); // Initial + 2 retries
    expect(aiEngine.fallbackProvider.generateStructuredOutput).toHaveBeenCalledTimes(1);
  });

  // Gemini 429 -> OpenAI fallback IF key configured
  it('Gemini 429 -> OpenAI fallback IF key configured', async () => {
    aiEngine.provider = {
      constructor: { name: 'GeminiProvider' },
      generateStructuredOutput: jest.fn().mockImplementation(async () => {
        const err = new Error('429 Too Many Requests');
        err.status = 429;
        throw err;
      })
    };
    aiEngine.fallbackProvider = {
      constructor: { name: 'OpenAIProvider' },
      generateStructuredOutput: jest.fn().mockResolvedValue({ success: true, fromFallback: true })
    };
    aiEngine.primaryProvider = aiEngine.provider;
    
    const result = await aiEngine._safeGenerate('prompt', 'text', z.object({}), 0); // test with 0 retries to test fallback immediately
    expect(result.fromFallback).toBe(true);
    expect(aiEngine.provider.generateStructuredOutput).toHaveBeenCalledTimes(1);
    expect(aiEngine.fallbackProvider.generateStructuredOutput).toHaveBeenCalledTimes(1);
  });

  // Gemini 401 -> no fallback
  it('Gemini 401 -> no fallback', async () => {
    aiEngine.provider = {
      constructor: { name: 'GeminiProvider' },
      generateStructuredOutput: jest.fn().mockImplementation(async () => {
        const err = new Error('401 Unauthorized');
        err.status = 401;
        throw err;
      })
    };
    aiEngine.fallbackProvider = {
      constructor: { name: 'OpenAIProvider' },
      generateStructuredOutput: jest.fn().mockResolvedValue({ success: true, fromFallback: true })
    };
    aiEngine.primaryProvider = aiEngine.provider;
    
    await expect(aiEngine._safeGenerate('prompt', 'text', z.object({}), 2)).rejects.toThrow('401 Unauthorized');
    expect(aiEngine.provider.generateStructuredOutput).toHaveBeenCalledTimes(1); // Should fail immediately
    expect(aiEngine.fallbackProvider.generateStructuredOutput).not.toHaveBeenCalled();
  });

  // Gemini 404 -> no fallback
  it('Gemini 404 -> no fallback', async () => {
    aiEngine.provider = {
      constructor: { name: 'GeminiProvider' },
      generateStructuredOutput: jest.fn().mockImplementation(async () => {
        const err = new Error('404 Model Not Found');
        err.status = 404;
        throw err;
      })
    };
    aiEngine.fallbackProvider = {
      constructor: { name: 'OpenAIProvider' },
      generateStructuredOutput: jest.fn().mockResolvedValue({ success: true, fromFallback: true })
    };
    aiEngine.primaryProvider = aiEngine.provider;
    
    await expect(aiEngine._safeGenerate('prompt', 'text', z.object({}), 2)).rejects.toThrow('404 Model Not Found');
    expect(aiEngine.provider.generateStructuredOutput).toHaveBeenCalledTimes(1); // Should fail immediately
    expect(aiEngine.fallbackProvider.generateStructuredOutput).not.toHaveBeenCalled();
  });

  // OpenAI fallback unavailable because API key is missing
  it('OpenAI fallback unavailable because API key is missing', async () => {
    aiEngine.provider = {
      constructor: { name: 'GeminiProvider' },
      generateStructuredOutput: jest.fn().mockImplementation(async () => {
        const err = new Error('503 Service Unavailable');
        err.status = 503;
        throw err;
      })
    };
    aiEngine.primaryProvider = aiEngine.provider;
    aiEngine.fallbackProvider = null; // Key is missing, so AIFactory returned null
    
    await expect(aiEngine._safeGenerate('prompt', 'text', z.object({}), 2)).rejects.toThrow('AI provider is temporarily unavailable due to high demand. Please try again later.');
    expect(aiEngine.provider.generateStructuredOutput).toHaveBeenCalledTimes(3); 
  });
  
  // Identical normalized output schema from both providers
  it('identical normalized output schema from both providers', async () => {
    const TestSchema = z.object({
      field1: z.string()
    });
    
    aiEngine.provider = {
      constructor: { name: 'GeminiProvider' },
      generateStructuredOutput: jest.fn().mockResolvedValue({ field1: 'value_gemini' })
    };
    aiEngine.primaryProvider = aiEngine.provider;
    aiEngine.fallbackProvider = null;
    
    const res1 = await aiEngine._safeGenerate('prompt', 'text', TestSchema);
    expect(res1).toEqual({ field1: 'value_gemini' });
    
    // Now test fallback producing identical structure
    aiEngine.provider = {
      constructor: { name: 'GeminiProvider' },
      generateStructuredOutput: jest.fn().mockImplementation(async () => {
        throw new Error('503 Service Unavailable');
      })
    };
    aiEngine.primaryProvider = aiEngine.provider;
    aiEngine.fallbackProvider = {
      constructor: { name: 'OpenAIProvider' },
      generateStructuredOutput: jest.fn().mockResolvedValue({ field1: 'value_openai' })
    };
    
    const res2 = await aiEngine._safeGenerate('prompt', 'text', TestSchema, 0);
    expect(res2).toEqual({ field1: 'value_openai' });
  });

});

const AIFactory = require('../../services/ai/AIFactory');

describe('AIFactory Validation Logic', () => {
  it('OPENAI_API_KEY undefined -> OpenAI unavailable', () => {
    expect(AIFactory.isValidConfiguredApiKey(undefined)).toBe(false);
  });
  it('OPENAI_API_KEY="" -> OpenAI unavailable', () => {
    expect(AIFactory.isValidConfiguredApiKey('')).toBe(false);
    expect(AIFactory.isValidConfiguredApiKey('   ')).toBe(false);
  });
  it('OPENAI_API_KEY="your_openai_api_key_here" -> OpenAI unavailable', () => {
    expect(AIFactory.isValidConfiguredApiKey('your_openai_api_key_here')).toBe(false);
  });
  it('OPENAI_API_KEY="your_openai_api_key" -> OpenAI unavailable', () => {
    expect(AIFactory.isValidConfiguredApiKey('your_openai_api_key')).toBe(false);
  });
  it('OPENAI_API_KEY="<your_openai_api_key>" -> OpenAI unavailable', () => {
    expect(AIFactory.isValidConfiguredApiKey('<your_openai_api_key>')).toBe(false);
  });
  it('OPENAI_API_KEY="sk-real-looking-value" -> OpenAI considered configured', () => {
    expect(AIFactory.isValidConfiguredApiKey('sk-real-looking-value')).toBe(true);
  });
});
