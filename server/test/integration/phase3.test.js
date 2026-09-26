const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const { z } = require('zod');
const aiEngine = require('../../services/ai/AIEngine');
const ScoringEngine = require('../../services/ai/ScoringEngine');
const resumesRoutes = require('../../routes/resumes');
const Resume = require('../../models/Resume');
const authRoutes = require('../../routes/auth');
const User = require('../../models/User');

const app = express();
app.use(express.json());
app.use('/api/resumes', resumesRoutes);
app.use('/api/auth', authRoutes);

const MONGO_TEST_URI = 'mongodb://127.0.0.1:27017/ats_resume_checker_test_phase3';

describe('Phase 3 Verification Tests', () => {
  beforeAll(async () => {
    await mongoose.connect(MONGO_TEST_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    await mongoose.connection.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  describe('1. ScoringEngine Audit & Empty/Edge Cases', () => {
    it('should cap experience score and not penalize non-metric experience below 50%', () => {
      const resume = {
        contact: { email: 'a@b.com', phone: '123' },
        summary: 'A long summary text that exceeds twenty characters.',
        experience: [
          { role: 'Dev', achievements: [] } // No metrics!
        ],
        education: [ { degree: 'BS' } ],
        projects: [],
        certifications: []
      };
      
      const jd = { required: { skills: ['React'], technologies: [] }, preferred: { skills: [], technologies: [] } };
      const reqM = { strongMatches: ['React'], partialMatches: [] };
      const prefM = { strongMatches: [], partialMatches: [] };
      
      const result = ScoringEngine.calculateScore(resume, jd, reqM, prefM);
      
      expect(result.breakdown.experience.score).toBe(50); // Floored at 50 because experience exists
      expect(result.breakdown.requiredSkills.score).toBe(100);
      expect(result.overallScore).toBeDefined();
    });

    it('should handle completely empty resume safely', () => {
      const resume = {
        contact: {},
        summary: '',
        experience: [],
        education: [],
        projects: [],
        certifications: []
      };
      const jd = { required: { skills: [], technologies: [] }, preferred: { skills: [], technologies: [] } };
      
      const result = ScoringEngine.calculateScore(
        resume, jd, 
        { strongMatches: [], partialMatches: [] }, 
        { strongMatches: [], partialMatches: [] }
      );
      
      expect(result.overallScore).toBe(55); // 40 (Req) + 15 (Pref) + 0 + 0 + 0
      expect(result.breakdown.structure.score).toBe(0);
      expect(result.breakdown.experience.score).toBe(0);
    });
  });

  describe('2. Optimizer Anti-Hallucination & Zod Validation', () => {
    let originalProvider;
    
    beforeAll(() => {
      originalProvider = aiEngine.provider;
    });

    afterAll(() => {
      aiEngine.provider = originalProvider;
    });

    it('should throw Zod error on malformed AI output (invalid severity enum)', async () => {
      aiEngine.provider = {
        generateStructuredOutput: async (prompt, text, schema) => {
          // Mock returning invalid enum
          return schema.parse({
            resumeIssues: [{
              type: 'Content',
              issue: 'Bad',
              severity: 'SUPER_HIGH', // Invalid
              context: 'Test'
            }]
          });
        }
      };

      await expect(aiEngine.analyzeResumeIssues({}))
        .rejects
        .toThrow();
    });
  });

  describe('3. Versioning & Authorization Integration', () => {
    let tokenA;
    let tokenB;
    let resumeId;

    beforeAll(async () => {
      // User A
      let res = await request(app).post('/api/auth/signup').send({ name: 'A', email: 'a@test.com', password: 'pass' });
      tokenA = res.body.data.token;
      
      // User B
      res = await request(app).post('/api/auth/signup').send({ name: 'B', email: 'b@test.com', password: 'pass' });
      tokenB = res.body.data.token;
      const userBId = res.body.data.user.id;

      // Create Original Resume directly in DB
      const original = new Resume({
        userId: userBId, // User B owns this
        name: 'John',
        originalText: 'Original text',
        versionNumber: 1,
        isOriginal: true
      });
      await original.save();
      resumeId = original._id.toString();
    });

    it('should deny access to version endpoint for wrong owner', async () => {
      const res = await request(app)
        .get(`/api/resumes/${resumeId}/versions`)
        .set('Authorization', `Bearer ${tokenA}`); // User A trying to access User B's resume
        
      expect(res.statusCode).toBe(404); // Hidden from wrong owner
    });

    it('should deny optimization for unauthenticated user', async () => {
      const res = await request(app)
        .post(`/api/resumes/${resumeId}/optimize`)
        .send({ originalText: 'text', sectionContext: 'text' });
        
      expect(res.statusCode).toBe(401);
    });
  });
});
