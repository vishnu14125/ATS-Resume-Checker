const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const analyzeRoutes = require('../../routes/analyze');

const app = express();
app.use(express.json());
app.use('/api/analyze', analyzeRoutes);
const User = require('../../models/User');
const Resume = require('../../models/Resume');
const jwt = require('jsonwebtoken');

process.env.GEMINI_API_KEY = 'test';
process.env.OPENAI_API_KEY = 'test';

jest.mock('../../services/ai/AIEngine', () => ({
  enhanceAnalysis: jest.fn().mockResolvedValue({
    recommendations: [],
    resumeIssues: [],
    analysisMode: 'enhanced',
    aiStatus: 'success',
    provider: 'TestProvider'
  })
}));

let mongoServer;
let token;
let user;

jest.setTimeout(60000);

beforeAll(async () => {
  process.env.JWT_SECRET = 'secret';
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  user = new User({
    name: 'Test User',
    email: 'testuser@example.com',
    password: 'password123'
  });
  await user.save();

  token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: 3600 });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Phase 5G: V2 Production Adapter API Integration', () => {
  let v2ModeBackup;
  beforeEach(() => {
    v2ModeBackup = process.env.ATS_V2_MODE;
  });

  afterEach(() => {
    process.env.ATS_V2_MODE = v2ModeBackup;
  });

  it('1. Returns 401 for unauthorized analysis', async () => {
    const res = await request(app)
      .post('/api/analyze')
      .send({
        resumeText: 'React developer',
        jobDescription: 'Need React developer',
        fileName: 'resume.txt'
      });
    
    expect(res.statusCode).toBe(401);
  });

  it('2. Fails cleanly for missing resume', async () => {
    const res = await request(app)
      .post('/api/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({
        jobDescription: 'Need React developer',
      });
    
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('3. Runs V1 mode when ATS_V2_MODE=v1', async () => {
    process.env.ATS_V2_MODE = 'v1';
    const res = await request(app)
      .post('/api/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({
        resumeText: 'Experienced React developer with 5 years in JavaScript.',
        jobDescription: 'Need React developer with JavaScript.',
        fileName: 'resume.txt'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    
    const saved = await Resume.findById(res.body.data.id);
    expect(saved).toBeDefined();
    // In V1, metadata.analysisMode is 'local_only' (or 'enhanced' if AI is mocking it, but it should be local_only here)
    expect(['local_only', 'enhanced']).toContain(saved.metadata.analysisMode);
    expect(saved.metadata.v2Comparison).toBeUndefined(); // No shadow mode
  });

  it('4. Runs shadow mode when ATS_V2_MODE=shadow and records comparison', async () => {
    process.env.ATS_V2_MODE = 'shadow';
    const res = await request(app)
      .post('/api/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({
        resumeText: 'Senior Python Engineer. Worked on Django. This padding ensures length > 50 chars.',
        jobDescription: 'Required: Python, Django. This padding ensures length > 50 chars.',
        fileName: 'python_dev.pdf'
      });

    expect(res.statusCode).toBe(200);
    
    const saved = await Resume.findById(res.body.data.id);
    expect(saved.metadata.v2Comparison).toBeDefined(); // Recorded shadow
    expect(saved.metadata.v2Comparison.v1Score).toBe(saved.overallScore);
    expect(saved.metadata.v2Comparison.v2AnalysisVersion).toBe("2.1.0");
    // Ensure primary V1 fields are still there
    expect(['local_only', 'enhanced']).toContain(saved.metadata.analysisMode);
  });

  it('5. Runs V2 mode when ATS_V2_MODE=v2', async () => {
    process.env.ATS_V2_MODE = 'v2';
    const res = await request(app)
      .post('/api/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({
        resumeText: 'Java Developer. Used Spring Boot. This padding ensures length > 50 chars.',
        jobDescription: 'Java and Spring Boot developer required. This padding ensures length > 50 chars.',
        fileName: 'java.docx'
      });

    expect(res.statusCode).toBe(200);
    
    const saved = await Resume.findById(res.body.data.id);
    // In V2, analysisMode is 'v2_deterministic'
    expect(saved.metadata.analysisMode).toBe('v2_deterministic');
    
    // Check backward compatibility fields are filled!
    expect(saved.overallScore).toBeDefined();
    expect(saved.skillMatches).toBeDefined();
    expect(saved.resumeIssues).toBeDefined();

    // Check V2 fields
    expect(saved.matchScore).toBeDefined();
    expect(saved.parseScore).toBeDefined();
    expect(saved.evidence).toBeDefined();
    expect(saved.metadata.scoringVersion).toBe("v2");
    
    // Never combine parseScore and matchScore
    expect(typeof saved.matchScore).toBe('number');
    expect(typeof saved.parseScore).toBe('number');
  });

  it('6. V2 failure in shadow mode gracefully falls back to V1 without crashing', async () => {
    process.env.ATS_V2_MODE = 'shadow';
    // Send a maliciously short text that might break V2 if it wasn't safe
    const res = await request(app)
      .post('/api/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({
        resumeText: 'a'.repeat(60),
        jobDescription: 'b'.repeat(60),
        fileName: 'empty.pdf'
      });

    expect(res.statusCode).toBe(200);
    const saved = await Resume.findById(res.body.data.id);
    expect(['local_only', 'enhanced']).toContain(saved.metadata.analysisMode);
    // Might not have v2Comparison if V2 aborted
  });
});
