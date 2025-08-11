 
const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const fs = require('fs');

const Resume = require('../models/Resume');
const anonymizeResume = require('../services/anonymizer');
const { analyzeResume } = require('../services/analysisService');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.single('resume'), async (req, res) => {
  try {
    const pdfBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(pdfBuffer);
    const originalText = data.text;
    const anonymizedText = anonymizeResume(originalText);

    const jobDescription = req.body.jobDescription;

    if (!jobDescription) {
      return res.status(400).json({
        success: false,
        error: 'Missing job description'
      });
    }

    const analysis = await analyzeResume(originalText, jobDescription, req.file.originalname);
    const score = analysis.overallScore;

    const newResume = new Resume({
      name: req.body.name || 'Unknown',
      gender: req.body.gender || 'unknown',
      location: req.body.location || 'unspecified',
      originalText,
      anonymizedText,
      score
    });

    console.log('Saving resume:', newResume);
    await newResume.save();

    res.json({
      success: true,
      score,
      id: newResume._id,
      data: {
        text: originalText
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
