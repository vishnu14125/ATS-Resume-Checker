 
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parseDocument } = require('../services/documentService');
const Resume = require('../models/Resume');
const anonymizeResume = require('../services/anonymizer');
const { analyzeResume } = require('../services/analysisService');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, and TXT files are allowed.'), false);
    }
  }
});

/**
 * @route POST /api/upload
 * @desc Upload and parse resume document
 * @access Public
 */
router.post('/', upload.single('resume'), async (req, res, next) => {
  try {
     console.log('📥 Incoming request received!');
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, mimetype, buffer } = req.file;
    const parsedText = await parseDocument(buffer, mimetype);

    if (!parsedText || parsedText.trim().length === 0) {
      return res.status(400).json({ error: 'Document parsing failed' });
    }

    const anonymizedText = anonymizeResume(parsedText);
    const jobDescription = req.body.jobDescription || '';

    const analysis = await analyzeResume(parsedText, jobDescription, originalname);

    // ✅ Validate analysis before saving
    if (!analysis || !analysis.keywordAnalysis || !analysis.feedback) {
      console.error("❌ Incomplete or failed analysis. Skipping DB save.");
      return res.status(500).json({ error: "Resume analysis failed. Please try again later." });
    }

    const score = analysis.overallScore || 0;

    // 🧠 Debugging Logs
    console.log('✅ Matched Keywords:', analysis.keywordAnalysis.matched);
    console.log('❌ Missing Keywords:', analysis.keywordAnalysis.missing);
    console.log('📝 Suggestions:', analysis.feedback);
    console.log('📊 Analysis Score:', score);

    const newResume = new Resume({
      name: req.body.name || 'Unknown',
      gender: req.body.gender || 'unknown',
      location: req.body.location || 'unspecified',
      originalText: parsedText,
      anonymizedText,
      score,
      keywordsMatched: analysis.keywordAnalysis.matched || [],
      keywordsMissing: analysis.keywordAnalysis.missing || [],
      suggestions: analysis.feedback || ''
    });

    console.log('📥 Resume object prepared:', {
      name: newResume.name,
      score: newResume.score,
      matched: newResume.keywordsMatched.length,
      missing: newResume.keywordsMissing.length
    });

    await newResume.save();
    console.log('✅ Resume saved to MongoDB:', newResume._id);

    res.json({
      success: true,
      id: newResume._id,
      data: {
        fileName: originalname,
        fileType: mimetype,
        text: parsedText,
        textLength: parsedText.length,
        wordCount: parsedText.split(/\s+/).length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Upload error:', error.message);
    console.dir(error, { depth: 5 });
    next(error);
  }
});

/**
 * @route GET /api/upload/supported-formats
 * @desc Get list of supported file formats
 * @access Public
 */
router.get('/supported-formats', (req, res) => {
  res.json({
    supportedFormats: [
      {
        extension: '.pdf',
        mimeType: 'application/pdf',
        description: 'Portable Document Format'
      },
      {
        extension: '.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        description: 'Microsoft Word Document'
      },
      {
        extension: '.txt',
        mimeType: 'text/plain',
        description: 'Plain Text File'
      }
    ],
    maxFileSize: '10MB'
  });
});

module.exports = router;
