const SemanticMatcherV2 = require('../../services/matching/SemanticMatcherV2');
const EmbeddingService = require('../../services/ai/EmbeddingService');

describe('SemanticMatcherV2', () => {
  beforeEach(() => {
    SemanticMatcherV2.clearCache();
    jest.restoreAllMocks();
  });

  it('1. Caches embeddings correctly', async () => {
    const mockEmbed = jest.spyOn(EmbeddingService, 'generateEmbedding').mockResolvedValue([0.1, 0.2]);
    await SemanticMatcherV2._getEmbedding('test');
    await SemanticMatcherV2._getEmbedding('test');
    expect(mockEmbed).toHaveBeenCalledTimes(1);
    mockEmbed.mockRestore();
  });

  it('2. Java vs JavaScript taxonomy knockout', async () => {
    const isKnockout = SemanticMatcherV2._isTaxonomyKnockout('java', 'javascript framework');
    expect(isKnockout).toBe(true);
  });

  it('3. React vs React Native taxonomy knockout', async () => {
    const isKnockout = SemanticMatcherV2._isTaxonomyKnockout('react native', 'i love react programming');
    expect(isKnockout).toBe(true);
  });

  it('4. Returns empty if missingRequirements is empty', async () => {
    const res = await SemanticMatcherV2.match([], { skills: ['react'] });
    expect(res).toHaveLength(0);
  });

  it('5. Handles graceful failure if EmbeddingService fails', async () => {
    jest.spyOn(EmbeddingService, 'generateEmbedding').mockRejectedValue(new Error('fail'));
    const res = await SemanticMatcherV2.match(['react'], { skills: ['react'] });
    expect(res).toHaveLength(0); // Fails gracefully, returning empty array
  });

  it('6. Semantic positive case (Frontend vs React)', async () => {
    jest.spyOn(EmbeddingService, 'generateEmbedding').mockImplementation(async (text) => {
      if (text.includes('frontend')) return [1, 0, 0];
      if (text.includes('react')) return [0.9, 0.4358, 0]; // sim = ~0.9
      return [0, 1, 0];
    });

    const res = await SemanticMatcherV2.match(['frontend engineering'], { skills: ['react'] });
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe('MATCHED');
    expect(res[0].matchType).toBe('semantic');
  });

  it('7. Semantic ambiguous case', async () => {
    jest.spyOn(EmbeddingService, 'generateEmbedding').mockImplementation(async (text) => {
      if (text.includes('cloud')) return [1, 0, 0];
      if (text.includes('aws')) return [0.8, 0.6, 0]; // sim = 0.8
      return [0, 1, 0];
    });

    const res = await SemanticMatcherV2.match(['cloud computing'], { skills: ['aws'] });
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe('AMBIGUOUS'); 
  });

  it('8. Semantic negative case', async () => {
    jest.spyOn(EmbeddingService, 'generateEmbedding').mockImplementation(async (text) => {
      if (text.includes('database')) return [1, 0, 0];
      if (text.includes('photoshop')) return [0, 1, 0]; // sim = 0
      return [0, 0, 1];
    });

    const res = await SemanticMatcherV2.match(['database'], { skills: ['photoshop'] });
    expect(res).toHaveLength(0); 
  });

  // Expand Matrix Tests
  const setupSimilarity = (simMap) => {
    jest.spyOn(EmbeddingService, 'generateEmbedding').mockImplementation(async (text) => {
       const keys = Object.keys(simMap);
       for (const key of keys) {
          if (text.toLowerCase().includes(key.toLowerCase())) {
             return simMap[key];
          }
       }
       return [0, 1, 0];
    });
  };

  it('9. Threshold exactly 0.85 -> MATCHED', async () => {
    setupSimilarity({
      'req': [1, 0, 0],
      'ev': [0.85, Math.sqrt(1 - 0.85*0.85), 0]
    });
    const res = await SemanticMatcherV2.match(['req'], { skills: ['ev'] });
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe('MATCHED');
  });

  it('10. Threshold exactly 0.75 -> AMBIGUOUS', async () => {
    setupSimilarity({
      'req': [1, 0, 0],
      'ev': [0.75, Math.sqrt(1 - 0.75*0.75), 0]
    });
    const res = await SemanticMatcherV2.match(['req'], { skills: ['ev'] });
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe('AMBIGUOUS');
  });

  it('11. Below 0.75 (0.74) -> missing', async () => {
    setupSimilarity({
      'req': [1, 0, 0],
      'ev': [0.74, Math.sqrt(1 - 0.74*0.74), 0]
    });
    const res = await SemanticMatcherV2.match(['req'], { skills: ['ev'] });
    expect(res).toHaveLength(0);
  });

  const knockouts = [
    ['Java', 'JavaScript framework'],
    ['React', 'React Native apps'],
    ['C++', 'C# development'],
    ['SQL', 'NoSQL db'],
    ['PostgreSQL', 'MongoDB'],
    ['Bash', 'JavaScript'],
    ['Python', 'PyTorch models'],
    ['AWS', 'AWS Certification']
  ];

  knockouts.forEach(([req, ev], idx) => {
    it(`12.${idx} Taxonomy knockout prevents ${req} matching ${ev}`, () => {
      expect(SemanticMatcherV2._isTaxonomyKnockout(req.toLowerCase(), ev.toLowerCase())).toBe(true);
    });
  });

  it('13. Context extraction captures experience and projects properly', async () => {
    setupSimilarity({
      'database': [1, 0, 0],
      'mongodb': [0.9, Math.sqrt(1 - 0.9*0.9), 0]
    });
    const res = await SemanticMatcherV2.match(['database'], { 
       experience: [{ description: "I configured a mongodb cluster." }]
    });
    expect(res).toHaveLength(1);
    expect(res[0].resumeSection).toBe('experience');
    expect(res[0].resumeEvidence).toBe('I configured a mongodb cluster.');
  });

  it('14. Empty evidence yields nothing gracefully', async () => {
    const res = await SemanticMatcherV2.match(['database'], {});
    expect(res).toHaveLength(0);
  });
  
  it('15. Duplicate sentence evidence dedupes automatically', async () => {
    setupSimilarity({
      'cloud': [1, 0, 0],
      'azure': [0.9, Math.sqrt(1 - 0.9*0.9), 0] 
    });
    const res = await SemanticMatcherV2.match(['cloud'], { 
       experience: [
         { description: "deployed to azure." },
         { description: "deployed to azure." }
       ]
    });
    expect(res).toHaveLength(1);
  });
});
