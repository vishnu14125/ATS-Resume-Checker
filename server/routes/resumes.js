const express = require('express');
const router = express.Router();
const Resume = require('../models/Resume');
const { requireAuth } = require('../middleware/authMiddleware');

/**
 * @route GET /api/resumes
 * @desc Get all resumes for the authenticated user
 * @access Private
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const resumes = await Resume.find({ userId: req.user.id }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: resumes,
      message: 'Resumes retrieved successfully'
    });
  } catch (error) {
    console.error('Fetch resumes error:', error);
    next(error);
  }
});

/**
 * @route GET /api/resumes/:id
 * @desc Get a specific resume by ID (must belong to user)
 * @access Private
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, userId: req.user.id });
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Resume not found or unauthorized'
        }
      });
    }

    // Return Phase 2 Structured Data to Frontend
    res.json({
      success: true,
      data: {
        id: resume._id,
        fileName: resume.fileName,
        jobDescription: resume.jobDescription,
        originalText: resume.originalText,
        analysis: {
          overallScore: resume.overallScore,
          metadata: resume.metadata,
          scoreBreakdown: resume.scoreBreakdown,
          skillMatches: resume.skillMatches,
          recommendations: resume.recommendations,
          resumeIssues: resume.resumeIssues,
          structuredResume: resume.structuredResume,
          structuredJD: resume.structuredJD
        }
      },
      message: 'Resume retrieved successfully'
    });

  } catch (error) {
    console.error('Fetch resume by id error:', error);
    next(error);
  }
});

/**
 * @route POST /api/resumes/:id/optimize
 * @desc Optimize a specific resume section
 * @access Private
 */
router.post('/:id/optimize', requireAuth, async (req, res, next) => {
  try {
    const { originalText, sectionContext } = req.body;
    
    if (!originalText || !sectionContext) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing text or context' } });
    }

    const resume = await Resume.findOne({ _id: req.params.id, userId: req.user.id });
    if (!resume) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Resume not found' } });

    const aiEngine = require('../services/ai/AIEngine');
    const optimization = await aiEngine.optimizeResumeSection(originalText, sectionContext, resume.jobDescription || "");

    res.json({
      success: true,
      data: optimization,
      message: 'Optimization complete'
    });
  } catch (error) {
    console.error('Optimize error:', error);
    next(error);
  }
});

/**
 * @route GET /api/resumes/:id/versions
 * @desc Get versions history for a resume
 * @access Private
 */
router.get('/:id/versions', requireAuth, async (req, res, next) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, userId: req.user.id });
    if (!resume) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Resume not found' } });

    // The base ID is either this resume itself (if it's the original) or its baseResumeId
    const baseId = resume.baseResumeId || resume._id;
    
    const versions = await Resume.find({
      $or: [ { _id: baseId }, { baseResumeId: baseId } ],
      userId: req.user.id
    }).sort({ versionNumber: -1 }).select('_id versionNumber isOriginal createdAt overallScore scoreBreakdown');

    res.json({
      success: true,
      data: versions,
      message: 'Versions retrieved'
    });
  } catch (error) {
    console.error('Versions fetch error:', error);
    next(error);
  }
});

/**
 * @route POST /api/resumes/:id/versions
 * @desc Save a new optimized version of the resume
 * @access Private
 */
router.post('/:id/versions', requireAuth, async (req, res, next) => {
  try {
    const { optimizedText, optimizedStructuredResume } = req.body;
    
    const resume = await Resume.findOne({ _id: req.params.id, userId: req.user.id });
    if (!resume) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Resume not found' } });

    const baseId = resume.baseResumeId || resume._id;
    
    // Find the latest version number
    const latestVersion = await Resume.findOne({
      $or: [ { _id: baseId }, { baseResumeId: baseId } ]
    }).sort({ versionNumber: -1 });
    
    const nextVersionNumber = (latestVersion ? latestVersion.versionNumber : 1) + 1;

    // We must run the deterministic analysis again on the optimized text
    const { analyzeResume } = require('../services/analysisService');
    const analysis = await analyzeResume(optimizedText, resume.jobDescription, resume.fileName);

    const newVersion = new Resume({
      userId: req.user.id,
      name: resume.name,
      fileName: resume.fileName,
      jobDescription: resume.jobDescription,
      originalText: optimizedText,
      
      baseResumeId: baseId,
      versionNumber: nextVersionNumber,
      isOriginal: false,
      
      structuredResume: optimizedStructuredResume || analysis.structuredResume,
      structuredJD: analysis.structuredJD,
      
      overallScore: analysis.overallScore,
      scoreBreakdown: analysis.scoreBreakdown,
      skillMatches: analysis.skillMatches,
      recommendations: analysis.recommendations,
      resumeIssues: analysis.resumeIssues,
      metadata: analysis.metadata
    });

    await newVersion.save();

    res.json({
      success: true,
      data: { id: newVersion._id, versionNumber: newVersion.versionNumber },
      message: 'New version created successfully'
    });
  } catch (error) {
    console.error('Create version error:', error);
    next(error);
  }
});

/**
 * @route DELETE /api/resumes/:id
 * @desc Delete a specific resume by ID
 * @access Private
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const resume = await Resume.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Resume not found or unauthorized' }
      });
    }

    // Optional: Cascade delete career items (LearningRoadmap, InterviewPrep, etc.)
    const InterviewPrep = require('../models/InterviewPrep');
    const LearningRoadmap = require('../models/LearningRoadmap');
    const ProjectRelevance = require('../models/ProjectRelevance');

    await Promise.all([
      InterviewPrep.deleteOne({ resumeId: req.params.id }),
      LearningRoadmap.deleteOne({ resumeId: req.params.id }),
      ProjectRelevance.deleteOne({ resumeId: req.params.id })
    ]);

    res.json({
      success: true,
      message: 'Resume and associated intelligence deleted successfully'
    });
  } catch (error) {
    console.error('Delete resume error:', error);
    next(error);
  }
});

module.exports = router;
