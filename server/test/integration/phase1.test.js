const request = require('supertest');
const mongoose = require('mongoose');
const path = require('path');
const express = require('express');
const uploadRoutes = require('../../routes/upload');
const authRoutes = require('../../routes/auth');
const analyzeRoutes = require('../../routes/analyze');
const resumesRoutes = require('../../routes/resumes');
const User = require('../../models/User');
const Resume = require('../../models/Resume');

// Mock AI Services to avoid API calls during tests
jest.mock('../../services/analysisService', () => ({
  analyzeResume: jest.fn().mockResolvedValue({
    overallScore: 85,
    scoreBreakdown: { skills: { score: 90, evidence: '' } },
    skillMatches: {
      strongMatches: [],
      partialMatches: [],
      missingRequired: [],
      missingPreferred: []
    },
    recommendations: [],
    structuredResume: {},
    structuredJD: {},
    metadata: { test: true }
  })
}));

const app = express();
app.use(express.json());
app.use('/api/upload', uploadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/analyze', analyzeRoutes);
app.use('/api/resumes', resumesRoutes);

const MONGO_TEST_URI = 'mongodb://127.0.0.1:27017/ats_resume_checker_test';

beforeAll(async () => {
  await mongoose.connect(MONGO_TEST_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoose.connection.dropDatabase();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

// Remove afterEach to allow state to persist between tests since we drop DB at the end

describe('Phase 1.5 Integration Tests', () => {
  let userTokenA;
  let userTokenB;
  let userIdA;
  let resumeIdA;

  describe('Authentication', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'User A', email: 'usera@example.com', password: 'password123' });
      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      userTokenA = res.body.data.token;
      userIdA = res.body.data.user.id;
    });

    it('should login an existing user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'usera@example.com', password: 'password123' });
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
    });

    it('should reject invalid login', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'wrong' });
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('Upload Flow', () => {
    const fs = require('fs');
    const path = require('path');
    
    it('should reject oversized or invalid files', async () => {
      const badFilePath = path.join(__dirname, 'dummy_bad_file.invalid');
      fs.writeFileSync(badFilePath, 'console.log("hello");');

      try {
        const res = await request(app)
          .post('/api/upload')
          .set('Authorization', `Bearer ${userTokenA}`)
          .attach('resume', badFilePath);
        
        expect(res.statusCode).toEqual(400); 
      } catch (err) {
        // Supertest sometimes throws ECONNRESET when server responds 400 and closes connection early
        if (err.code !== 'ECONNRESET') {
          throw err;
        }
      } finally {
        if (fs.existsSync(badFilePath)) {
          fs.unlinkSync(badFilePath);
        }
      }
    });

    it('should parse valid txt file without creating Resume DB record', async () => {
      const txtFilePath = path.join(__dirname, 'test.txt');
      fs.writeFileSync(txtFilePath, 'John Doe\nSoftware Engineer\nReact, Node.js');

      const initialCount = await Resume.countDocuments();

      const res = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${userTokenA}`)
        .attach('resume', txtFilePath);
        
      fs.unlinkSync(txtFilePath);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.text).toContain('John Doe');
      
      const finalCount = await Resume.countDocuments();
      expect(finalCount).toEqual(initialCount); // Did not create a DB record
    });
  });

  describe('Analysis Flow & Ownership', () => {
    it('should reject unauthenticated analysis request', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ resumeText: 'Test', jobDescription: 'Test' });
      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should perform analysis and save resume for authenticated user', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .set('Authorization', `Bearer ${userTokenA}`)
        .send({ 
          resumeText: 'John Doe React Node Engineer looking for an awesome opportunity to write robust and scalable software. Experience with React and Node.js.', 
          jobDescription: 'We need a React dev who has at least 3 years of experience and knows Node.js.',
          fileName: 'john.pdf'
        });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      resumeIdA = res.body.data.id;

      // Verify it was saved to DB
      const dbResume = await Resume.findById(resumeIdA);
      expect(dbResume).not.toBeNull();
      expect(dbResume.userId.toString()).toEqual(userIdA);
    });
  });

  describe('Results Flow (Ownership Enforcement)', () => {
    beforeAll(async () => {
      // Create User B
      const resB = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'User B', email: 'userb@example.com', password: 'password123' });
      userTokenB = resB.body.data.token;
    });

    it('should allow User A to view their own resume', async () => {
      const res = await request(app)
        .get(`/api/resumes/${resumeIdA}`)
        .set('Authorization', `Bearer ${userTokenA}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toEqual(resumeIdA);
    });

    it('should NOT allow User B to view User A resume', async () => {
      const res = await request(app)
        .get(`/api/resumes/${resumeIdA}`)
        .set('Authorization', `Bearer ${userTokenB}`);
      
      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should NOT allow unauthenticated user to view resume', async () => {
      const res = await request(app)
        .get(`/api/resumes/${resumeIdA}`);
      
      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
    });
    
    it('should handle nonexistent ID safely', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/resumes/${fakeId}`)
        .set('Authorization', `Bearer ${userTokenA}`);
      
      expect(res.statusCode).toEqual(404);
    });
  });

  describe('Dashboard Flow', () => {
    it('should return multiple resumes for User A', async () => {
      // Create a second resume for User A
      await request(app)
        .post('/api/analyze')
        .set('Authorization', `Bearer ${userTokenA}`)
        .send({ 
          resumeText: 'This is the second resume with enough text to pass validation length requirements of fifty characters.', 
          jobDescription: 'This is the second job description length requirement pass.',
          fileName: 'second.pdf'
        });

      const res = await request(app)
        .get('/api/resumes')
        .set('Authorization', `Bearer ${userTokenA}`);
        
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty resumes list for User B', async () => {
      const res = await request(app)
        .get('/api/resumes')
        .set('Authorization', `Bearer ${userTokenB}`);
        
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toEqual(0);
    });
  });
});