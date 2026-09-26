const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const { z } = require('zod');
const aiEngine = require('../../services/ai/AIEngine');
const resumesRoutes = require('../../routes/resumes');
const careerRoutes = require('../../routes/career');
const authRoutes = require('../../routes/auth');
const Resume = require('../../models/Resume');
const InterviewPrep = require('../../models/InterviewPrep');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/resumes', resumesRoutes);
app.use('/api/career', careerRoutes);

const MONGO_TEST_URI = 'mongodb://127.0.0.1:27017/ats_resume_checker_test_phase4';

describe('Phase 4: Career Intelligence Integration', () => {
  let token;
  let resumeId;
  let originalProvider;

  beforeAll(async () => {
    await mongoose.connect(MONGO_TEST_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    await mongoose.connection.dropDatabase();

    // Signup user
    const res = await request(app).post('/api/auth/signup').send({ name: 'User4', email: 'user4@test.com', password: 'password' });
    token = res.body.data.token;
    const userId = res.body.data.user.id;

    // Create a mock resume analysis
    const resume = new Resume({
      userId,
      name: 'Software Engineer Role',
      originalText: 'My resume text with React and Node',
      structuredResume: {
        skills: [],
        experience: [],
        projects: [ { projectName: 'Test Project', description: 'Used React' } ]
      },
      structuredJD: {
        title: 'Frontend Engineer'
      },
      skillMatches: {
        missingRequired: ['Docker'],
        missingPreferred: ['GraphQL']
      }
    });
    await resume.save();
    resumeId = resume._id.toString();

    // Mock AI engine structured output for tests
    originalProvider = aiEngine.provider;
  });

  afterAll(async () => {
    aiEngine.provider = originalProvider;
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  describe('1. Interview Preparation', () => {
    it('should generate and persist interview preparation', async () => {
      // Mock the AI output
      aiEngine.provider = {
        generateStructuredOutput: async (prompt, text, schema) => {
          return schema.parse({
            questions: [
              {
                category: 'Skill-Gap',
                difficulty: 'Medium',
                question: 'How does Docker work?',
                evidence: 'JD requires Docker, missing in resume',
                reasoning: 'Critical required skill',
                preparationGuidance: 'Review containers'
              }
            ]
          });
        }
      };

      const res = await request(app)
        .post(`/api/career/${resumeId}/interview-prep`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.questions.length).toBe(1);
      
      const prepInDb = await InterviewPrep.findOne({ resumeId });
      expect(prepInDb).not.toBeNull();
      expect(prepInDb.questions[0].category).toBe('Skill-Gap');
    });

    it('should retrieve existing interview preparation', async () => {
      const res = await request(app)
        .get(`/api/career/${resumeId}/interview-prep`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.questions.length).toBe(1);
    });

    it('should allow updating question status', async () => {
      const prep = await InterviewPrep.findOne({ resumeId });
      const qId = prep.questions[0]._id.toString();

      const res = await request(app)
        .put(`/api/career/${resumeId}/interview-prep/${qId}`)
        .send({ status: 'Prepared' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.questions[0].status).toBe('Prepared');
    });
  });

  describe('2. Learning Roadmap', () => {
    it('should generate and persist learning roadmap prioritizing missing required skills', async () => {
      aiEngine.provider = {
        generateStructuredOutput: async (prompt, text, schema) => {
          return schema.parse({
            items: [
              {
                skill: 'Docker',
                reason: 'Required by JD',
                priority: 'Critical',
                currentEvidence: 'Evidence not detected in the uploaded resume.',
                targetRequirement: 'Experience with Docker',
                prerequisites: ['Networking'],
                suggestedSequence: ['Containers', 'Images'],
                effort: '2 weeks'
              }
            ]
          });
        }
      };

      const res = await request(app)
        .post(`/api/career/${resumeId}/learning-roadmap`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.items[0].skill).toBe('Docker');
      expect(res.body.data.items[0].priority).toBe('Critical');
    });
  });

  describe('3. Project Relevance', () => {
    it('should generate and persist project relevance', async () => {
      aiEngine.provider = {
        generateStructuredOutput: async (prompt, text, schema) => {
          return schema.parse({
            projects: [
              {
                projectName: 'Test Project',
                technologies: ['React'],
                demonstratedCapabilities: ['Frontend'],
                relevantRequirements: ['Frontend Engineer'],
                matchingSkills: ['React'],
                missingInformation: ['Scale'],
                relevanceExplanation: 'Highly relevant',
                resumeEmphasisSuggestion: 'Highlight UI'
              }
            ]
          });
        }
      };

      const res = await request(app)
        .post(`/api/career/${resumeId}/project-relevance`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.projects[0].projectName).toBe('Test Project');
    });
  });

  describe('4. Security & Authorization', () => {
    it('should reject unauthorized access to career endpoints', async () => {
      // Create second user
      const res2 = await request(app).post('/api/auth/signup').send({ name: 'User5', email: 'user5@test.com', password: 'password' });
      const token2 = res2.body.data.token;

      // Try to access user4's project relevance
      const res = await request(app)
        .get(`/api/career/${resumeId}/project-relevance`)
        .set('Authorization', `Bearer ${token2}`);
      
      // The getter itself might return null or empty if not found matching userId
      // Or in our implementation `getResumeAnalysis` will throw NOT_FOUND for POST
      const postRes = await request(app)
        .post(`/api/career/${resumeId}/project-relevance`)
        .set('Authorization', `Bearer ${token2}`);
        
      expect(postRes.statusCode).toBe(404);
    });

    it('should enforce malformed AI output via Zod Validation Error', async () => {
      aiEngine.provider = {
        generateStructuredOutput: async (prompt, text, schema) => {
          return schema.parse({
            items: [
              {
                skill: 'Docker',
                priority: 'INVALID_PRIORITY', // Invalid enum
              }
            ]
          });
        }
      };

      const res = await request(app)
        .post(`/api/career/${resumeId}/learning-roadmap`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(500); // Caught by global error handler
    });
  });

  describe('5. Multi-JD Intelligence', () => {
    let setId;
    
    it('should create a job analysis set', async () => {
      const res = await request(app)
        .post('/api/career/job-sets')
        .send({ name: 'Frontend Roles', resumeId })
        .set('Authorization', `Bearer ${token}`);
        
      expect(res.statusCode).toBe(200);
      expect(res.body.data.name).toBe('Frontend Roles');
      setId = res.body.data._id.toString();
    });

    it('should add a job to the set and aggregate insights deterministically', async () => {
      // Mock extractJD
      aiEngine.extractJD = async () => ({
        title: 'React Dev',
        required: { skills: ['React', 'Next.js'], technologies: [] },
        preferred: { skills: ['TypeScript'], technologies: [] }
      });
      
      const SkillMatcher = require('../../services/ai/SkillMatcher');
      SkillMatcher.matchSkills = async (skills) => {
        if (skills.includes('React')) return { strongMatches: ['React'], partialMatches: [], missing: ['Next.js'], uncertain: [] };
        if (skills.includes('TypeScript')) return { strongMatches: [], partialMatches: [], missing: ['TypeScript'], uncertain: [] };
        return { strongMatches: [], partialMatches: [], missing: skills, uncertain: [] };
      };
      
      const res = await request(app)
        .post(`/api/career/job-sets/${setId}/jobs`)
        .send({ title: 'React Dev', company: 'TechCorp', description: 'Need React and Next.js' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.jobs.length).toBe(1);
      // The resume has React but not Next.js
      expect(res.body.data.aggregatedInsights.recurringGaps.required).toContain('Next.js');
    });
  });
});
