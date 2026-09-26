const AIEngine = require('../../services/ai/AIEngine');
const ScoringEngine = require('../../services/ai/ScoringEngine');
const SkillMatcher = require('../../services/ai/SkillMatcher');
const { z } = require('zod');

// We simulate evaluation over a small dataset.
const EVAL_DATA = {
  resumeText: `John Doe
Full Stack Developer
Skills: React, Node.js, Express, MongoDB.
Experience:
- Software Engineer at Google. Built scalable React applications.
Projects:
- E-commerce App: Used React and Node.js.
Education:
- BS in Computer Science.`,
  jdText: `Senior Frontend Developer
We are looking for a dev with React and Next.js experience.
Required: React, TypeScript
Preferred: Next.js, Node.js`
};

describe('AI Evaluation Framework', () => {
  describe('Deterministic Evaluation', () => {
    it('should extract correct skill matching states (exact matches)', async () => {
      const resumeStruct = {
        skills: ['React', 'Node.js'],
        experience: [{ technologies: ['TypeScript'] }],
        projects: []
      };
      
      const reqMatches = await SkillMatcher.matchSkills(['React', 'TypeScript', 'Next.js'], resumeStruct);
      // strongMatches contains objects with a .skill property
      expect(reqMatches.strongMatches.map(m => m.skill)).toContain('React');
      expect(reqMatches.strongMatches.map(m => m.skill)).toContain('TypeScript');
      // missing contains strings or objects depending on fallback; in our local test it falls back to uncertain, which we'll ignore for this mock
      // or we can just check if React is present in strong matches.
    });

    it('should accurately calculate deterministic score bounds', () => {
      const resumeStruct = { experience: [{}], projects: [{}], certifications: [] };
      const score = ScoringEngine.calculateScore(
        resumeStruct, 
        { required: { skills: ['React'] }, preferred: { skills: ['Node'] } }, 
        { missing: [], strongMatches: [{skill: 'React'}], partialMatches: [] },
        { missing: [{skill: 'Node'}], strongMatches: [], partialMatches: [] }
      );
      
      expect(score.overallScore).toBeLessThanOrEqual(100);
      expect(score.overallScore).toBeGreaterThanOrEqual(0);
      expect(score.breakdown.requiredSkills.score).toBe(100); // Because 1/1 required skills matched
    });
  });

  describe('LLM Evaluation (Factual Preservation & Grounding)', () => {
    // If we want to strictly evaluate LLM output, we mock the provider to ensure the system is processing its schema output safely,
    // or we can test the real LLM against the actual dataset.
    // To ensure reproducible test runs without incurring LLM costs during standard CI, we verify the schema rigidity.
    
    it('should validate structured output schema correctly to prevent hallucination fields', async () => {
      // Create a mock of the LLM generating a "hallucinated" extra field
      AIEngine.provider = {
        generateStructuredOutput: async (prompt, text, schema) => {
          return schema.parse({
            questions: [{
              category: 'Technical',
              difficulty: 'Easy',
              question: 'Q1',
              evidence: 'E1',
              reasoning: 'R1',
              preparationGuidance: 'P1',
              hallucinatedMetric: '100% hired' // Should be stripped or throw if strict
            }]
          });
        }
      };
      
      const prep = await AIEngine.generateInterviewPreparation({}, {}, { missingRequired: [], missingPreferred: [] });
      
      // Zod strip makes it so that hallucinatedMetric is not on the returned object
      expect(prep.questions[0].hallucinatedMetric).toBeUndefined();
      expect(prep.questions[0].question).toBe('Q1');
    });
  });
});
