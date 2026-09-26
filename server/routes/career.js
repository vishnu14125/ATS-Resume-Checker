const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const Resume = require('../models/Resume');
const InterviewPrep = require('../models/InterviewPrep');
const LearningRoadmap = require('../models/LearningRoadmap');
const ProjectRelevance = require('../models/ProjectRelevance');
const aiEngine = require('../services/ai/AIEngine');

// Helpers
const getResumeAnalysis = async (resumeId, userId) => {
  const resume = await Resume.findOne({ _id: resumeId, userId });
  if (!resume) throw new Error('NOT_FOUND');
  return resume;
};

// ----------------------------------------------------
// INTERVIEW PREPARATION
// ----------------------------------------------------

/**
 * @route GET /api/career/:resumeId/interview-prep
 * @desc Get generated interview prep or null
 */
router.get('/:resumeId/interview-prep', requireAuth, async (req, res, next) => {
  try {
    const prep = await InterviewPrep.findOne({ resumeId: req.params.resumeId, userId: req.user.id });
    res.json({ success: true, data: prep });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/career/:resumeId/interview-prep
 * @desc Generate interview prep
 */
router.post('/:resumeId/interview-prep', requireAuth, async (req, res, next) => {
  try {
    const resume = await getResumeAnalysis(req.params.resumeId, req.user.id);
    
    // Generate via AI
    const result = await aiEngine.generateInterviewPreparation(
      resume.structuredResume, 
      resume.structuredJD, 
      resume.skillMatches
    );

    // Persist idempotently
    const prep = await InterviewPrep.findOneAndUpdate(
      { resumeId: resume._id, userId: req.user.id },
      { questions: result.questions, updatedAt: Date.now() },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, data: prep });
  } catch (error) {
    if (error.message === 'NOT_FOUND') return res.status(404).json({ success: false, error: { message: 'Resume not found' } });
    next(error);
  }
});

/**
 * @route PUT /api/career/:resumeId/interview-prep/:questionId
 * @desc Update question status (Prepared/Unprepared/Difficult)
 */
router.put('/:resumeId/interview-prep/:questionId', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    const prep = await InterviewPrep.findOne({ resumeId: req.params.resumeId, userId: req.user.id });
    if (!prep) return res.status(404).json({ success: false, error: { message: 'Prep not found' } });
    
    const question = prep.questions.id(req.params.questionId);
    if (!question) return res.status(404).json({ success: false, error: { message: 'Question not found' } });
    
    question.status = status;
    await prep.save();
    
    res.json({ success: true, data: prep });
  } catch (error) {
    next(error);
  }
});

// ----------------------------------------------------
// LEARNING ROADMAP
// ----------------------------------------------------

router.get('/:resumeId/learning-roadmap', requireAuth, async (req, res, next) => {
  try {
    const roadmap = await LearningRoadmap.findOne({ resumeId: req.params.resumeId, userId: req.user.id });
    res.json({ success: true, data: roadmap });
  } catch (error) {
    next(error);
  }
});

router.post('/:resumeId/learning-roadmap', requireAuth, async (req, res, next) => {
  try {
    const resume = await getResumeAnalysis(req.params.resumeId, req.user.id);
    
    const result = await aiEngine.generateLearningRoadmap(
      resume.structuredResume, 
      resume.structuredJD, 
      resume.skillMatches
    );

    // Persist idempotently
    const roadmap = await LearningRoadmap.findOneAndUpdate(
      { resumeId: resume._id, userId: req.user.id },
      { items: result.items, updatedAt: Date.now() },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, data: roadmap });
  } catch (error) {
    if (error.message === 'NOT_FOUND') return res.status(404).json({ success: false, error: { message: 'Resume not found' } });
    next(error);
  }
});

// ----------------------------------------------------
// PROJECT RELEVANCE
// ----------------------------------------------------

router.get('/:resumeId/project-relevance', requireAuth, async (req, res, next) => {
  try {
    const projects = await ProjectRelevance.findOne({ resumeId: req.params.resumeId, userId: req.user.id });
    res.json({ success: true, data: projects });
  } catch (error) {
    next(error);
  }
});

router.post('/:resumeId/project-relevance', requireAuth, async (req, res, next) => {
  try {
    const resume = await getResumeAnalysis(req.params.resumeId, req.user.id);
    
    const result = await aiEngine.analyzeProjectRelevance(
      resume.structuredResume, 
      resume.structuredJD
    );

    // Persist idempotently
    const pr = await ProjectRelevance.findOneAndUpdate(
      { resumeId: resume._id, userId: req.user.id },
      { projects: result.projects, updatedAt: Date.now() },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, data: pr });
  } catch (error) {
    if (error.message === 'NOT_FOUND') return res.status(404).json({ success: false, error: { message: 'Resume not found' } });
    next(error);
  }
});

// ----------------------------------------------------
// MULTI-JD (JOB ANALYSIS SET)
// ----------------------------------------------------
const JobAnalysisSet = require('../models/JobAnalysisSet');
const structureService = require('../services/structureService');
const ScoringEngine = require('../services/ai/ScoringEngine');
const SkillMatcher = require('../services/ai/SkillMatcher');

router.get('/job-sets', requireAuth, async (req, res, next) => {
  try {
    const sets = await JobAnalysisSet.find({ userId: req.user.id });
    res.json({ success: true, data: sets });
  } catch (error) {
    next(error);
  }
});

router.post('/job-sets', requireAuth, async (req, res, next) => {
  try {
    const { name, resumeId } = req.body;
    const resume = await getResumeAnalysis(resumeId, req.user.id);
    
    const set = new JobAnalysisSet({
      userId: req.user.id,
      name,
      resumeId: resume._id,
      jobs: [],
      aggregatedInsights: {}
    });
    await set.save();
    res.json({ success: true, data: set });
  } catch (error) {
    next(error);
  }
});

router.post('/job-sets/:setId/jobs', requireAuth, async (req, res, next) => {
  try {
    const { title, company, description } = req.body;
    const set = await JobAnalysisSet.findOne({ _id: req.params.setId, userId: req.user.id });
    if (!set) return res.status(404).json({ success: false, error: { message: 'Set not found' } });
    
    const resume = await getResumeAnalysis(set.resumeId, req.user.id);
    
    // Parse the JD
    const structuredJD = await aiEngine.extractJD(description);
    
    // Evaluate resume against this new JD
    const requiredSkills = [...(structuredJD.required?.skills || []), ...(structuredJD.required?.technologies || [])];
    const preferredSkills = [...(structuredJD.preferred?.skills || []), ...(structuredJD.preferred?.technologies || [])];

    const requiredMatches = await SkillMatcher.matchSkills(requiredSkills, resume.structuredResume);
    const preferredMatches = await SkillMatcher.matchSkills(preferredSkills, resume.structuredResume);
    
    const score = ScoringEngine.calculateScore(resume.structuredResume, structuredJD, requiredMatches, preferredMatches);
    
    const analysis = {
      overallScore: score.overallScore,
      scoreBreakdown: score.breakdown,
      skillMatches: {
        missingRequired: requiredMatches.missing,
        missingPreferred: preferredMatches.missing,
        strongMatches: [...requiredMatches.strongMatches, ...preferredMatches.strongMatches],
        partialMatches: [...requiredMatches.partialMatches, ...preferredMatches.partialMatches]
      }
    };
    
    set.jobs.push({
      title,
      company,
      description,
      structuredJD,
      analysis
    });
    
    // Re-aggregate insights deterministically
    let allMissingRequired = new Set();
    let allMissingPreferred = new Set();
    
    set.jobs.forEach(job => {
      const { missingRequired, missingPreferred } = job.analysis.skillMatches;
      missingRequired.forEach(s => allMissingRequired.add(s.skill || s));
      missingPreferred.forEach(s => allMissingPreferred.add(s.skill || s));
    });
    
    set.aggregatedInsights = {
      recurringGaps: {
        required: Array.from(allMissingRequired),
        preferred: Array.from(allMissingPreferred)
      },
      totalJobs: set.jobs.length,
      averageScore: set.jobs.reduce((sum, job) => sum + job.analysis.overallScore, 0) / set.jobs.length
    };
    
    await set.save();
    res.json({ success: true, data: set });
  } catch (error) {
    console.error('Multi-JD Error:', error);
    next(error);
  }
});

module.exports = router;
