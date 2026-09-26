const mongoose = require('mongoose');
const { Schema } = mongoose;

const resumeSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },
  name: { type: String, default: 'Unknown' },
  fileName: { type: String },
  jobDescription: { type: String },
  originalText: { type: String, required: true },
  
  // Phase 2 Structured Data
  structuredResume: { type: Schema.Types.Mixed }, // Zod validated JSON
  structuredJD: { type: Schema.Types.Mixed }, // Zod validated JSON
  
  // Phase 3 Versioning
  baseResumeId: { type: Schema.Types.ObjectId, ref: 'Resume', index: true },
  versionNumber: { type: Number, default: 1 },
  isOriginal: { type: Boolean, default: true },
  
  // Phase 2/3 Scoring & Matches
  overallScore: { type: Number, default: 0 },
  scoreBreakdown: { type: Schema.Types.Mixed },
  
  skillMatches: {
    strongMatches: [Schema.Types.Mixed],
    partialMatches: [Schema.Types.Mixed],
    missingRequired: [Schema.Types.Mixed],
    missingPreferred: [Schema.Types.Mixed]
  },
  
  // Phase 3 Strict Recommendations
  recommendations: [{
    category: String,
    severity: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'] },
    title: String,
    explanation: String,
    evidence: {
      jobDescription: String,
      resume: String
    },
    action: String
  }],
  
  // Phase 3 Resume Issues
  resumeIssues: [{
    type: { type: String, enum: ['Content', 'Achievement Quality', 'Relevance', 'Structure', 'Language'] },
    issue: String,
    severity: String,
    context: String
  }],
  
  // Phase 5 V2 Specific Fields (Optional for backward compatibility)
  matchScore: { type: Number },
  parseScore: { type: Number },
  v2Breakdown: { type: Schema.Types.Mixed },
  evidence: [Schema.Types.Mixed],
  knockouts: [Schema.Types.Mixed],
  v2Recommendations: [Schema.Types.Mixed],
  experienceAnalysis: [Schema.Types.Mixed],
  projectAnalysis: [Schema.Types.Mixed],
  educationAnalysis: [Schema.Types.Mixed],
  certificationAnalysis: [Schema.Types.Mixed],
  
  metadata: { 
    provider: String,
    model: String,
    analysisDuration: Number,
    timestamp: { type: Date, default: Date.now },
    correlationId: String,
    analysisMode: {
      type: String,
      enum: ['enhanced', 'local_only', 'v2_deterministic', 'shadow'],
      default: 'local_only'
    },
    aiStatus: {
      type: String,
      enum: ['success', 'rate_limited', 'unavailable', 'not_configured', 'failed', 'timeout', 'not_attempted'],
      default: 'not_attempted'
    },
    v2Comparison: { type: Schema.Types.Mixed }, // For Shadow Mode
    parserVersion: String,
    matcherVersion: String,
    scoringVersion: String
  },
  
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('Resume', resumeSchema);
