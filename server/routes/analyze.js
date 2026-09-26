const express = require('express');
const router = express.Router();
const { analyzeResume } = require('../services/analysisService');
const { validateAnalysisRequest } = require('../middleware/validation');

const { requireAuth } = require('../middleware/authMiddleware');
const Resume = require('../models/Resume');
const anonymizeResume = require('../services/anonymizer');

/**
 * @route POST /api/analyze
 * @desc Analyze resume against job description
 * @access Private
 */
router.post('/', requireAuth, validateAnalysisRequest, async (req, res, next) => {
  try {
    const { resumeText, jobDescription, fileName } = req.body;

    if (!resumeText || !jobDescription) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Resume text and job description are required'
        }
      });
    }

    console.log(`📄 Analyzing resume: ${fileName || 'Untitled'}`);
    
    // Perform the analysis
    const analysis = await analyzeResume(resumeText, jobDescription, fileName);
    
    // Validate analysis
    if (!analysis || !analysis.skillMatches) {
      console.error("❌ Incomplete or failed analysis. Skipping DB save.");
      return res.status(500).json({ 
        success: false,
        error: {
          code: 'ANALYSIS_FAILED',
          message: 'Resume analysis failed. Please try again later.'
        }
      });
    }

    console.log(`✅ Analysis completed. Score: ${analysis.overallScore}/100`);
    
    // Save to DB
    const anonymizedText = anonymizeResume(resumeText);
    
    const newResume = new Resume({
      userId: req.user.id,
      name: req.body.name || 'Unknown',
      fileName: fileName || 'Untitled',
      jobDescription: jobDescription,
      originalText: resumeText,
      
      structuredResume: analysis.structuredResume,
      structuredJD: analysis.structuredJD,
      
      overallScore: analysis.overallScore,
      scoreBreakdown: analysis.scoreBreakdown,
      skillMatches: analysis.skillMatches,
      recommendations: analysis.recommendations,
      resumeIssues: analysis.resumeIssues,
      
      // V2 Optional Fields
      matchScore: analysis.matchScore,
      parseScore: analysis.parseScore,
      v2Breakdown: analysis.breakdown,
      evidence: analysis.evidence,
      knockouts: analysis.knockouts,
      v2Recommendations: analysis.recommendations,
      experienceAnalysis: analysis.experienceAnalysis,
      projectAnalysis: analysis.projectAnalysis,
      educationAnalysis: analysis.educationAnalysis,
      certificationAnalysis: analysis.certificationAnalysis,

      metadata: {
        ...analysis.metadata,
        analysisMode: analysis.analysisMode || analysis.metadata?.analysisMode || 'local_only',
        aiStatus: analysis.aiStatus || analysis.metadata?.aiStatus || 'not_attempted',
        v2Comparison: analysis.metadata?.v2Comparison,
        parserVersion: analysis.parserVersion || analysis.metadata?.parserVersion,
        matcherVersion: analysis.matcherVersion || analysis.metadata?.matcherVersion,
        scoringVersion: analysis.scoringVersion || analysis.metadata?.scoringVersion
      }
    });

    await newResume.save();
    console.log('✅ Resume saved to MongoDB:', newResume._id);

    res.json({
      success: true,
      data: {
        id: newResume._id
      },
      message: 'Analysis completed successfully'
    });

  } catch (error) {
    console.error('Analysis error:', error);
    next(error);
  }
});

/**
 * @route GET /api/analyze/health
 * @desc Check analysis service health
 * @access Public
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Resume Analysis',
    timestamp: new Date().toISOString()
  });
});

module.exports = router; 