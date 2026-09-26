const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parseDocument } = require('../services/documentService');
const { requireAuth } = require('../middleware/authMiddleware');

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Configure multer for file uploads securely using disk storage
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

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
      cb(new Error('Invalid file type. Please upload a PDF or DOCX resume.'));
    }
  }
});

// Wrapper to handle multer errors explicitly
const uploadMiddleware = (req, res, next) => {
  upload.single('resume')(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, error: { message: 'Your resume must be smaller than 10 MB.' } });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ success: false, error: { message: 'Unexpected field. Please ensure the file input is named "resume".' } });
      }
      return res.status(400).json({ success: false, error: { message: err.message } });
    } else if (err) {
      return res.status(400).json({ success: false, error: { message: err.message } });
    }
    next();
  });
};

/**
 * @route POST /api/upload
 * @desc Upload and parse resume document
 * @access Private
 */
router.post('/', requireAuth, uploadMiddleware, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { message: 'Please select a resume before continuing.' } });
    }

    const { originalname, mimetype, path: filePath } = req.file;
    const buffer = fs.readFileSync(filePath);
    
    let parsedText;
    try {
      parsedText = await parseDocument(buffer, mimetype);
    } catch (parseError) {
      console.error('Document parsing error:', parseError);
      // Pass the specific parser error message through
      return res.status(400).json({ success: false, error: { message: parseError.message } });
    } finally {
      // Clean up the uploaded file securely
      fs.unlink(filePath, (err) => {
        if (err) console.error(`Failed to delete temporary file ${filePath}:`, err);
      });
    }

    if (!parsedText || parsedText.trim().length === 0) {
      return res.status(400).json({ success: false, error: { message: 'Document parsing failed or document is empty.' } });
    }

    res.json({
      success: true,
      data: {
        fileName: originalname,
        fileType: mimetype,
        text: parsedText,
        textLength: parsedText.length,
        wordCount: parsedText.split(/\s+/).length
      },
      message: "File successfully parsed."
    });

  } catch (error) {
    console.error('Upload error:', error);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupErr) {
        console.error('Failed to cleanup file during error:', cleanupErr);
      }
    }
    res.status(500).json({ success: false, error: { message: 'We couldn\'t process your resume. Please try again.' } });
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
