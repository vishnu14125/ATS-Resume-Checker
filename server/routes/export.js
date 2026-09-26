 
const express = require('express');
const PDFDocument = require('pdfkit');
const Resume = require('../models/Resume');

const router = express.Router();

router.get('/:resumeId', async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.resumeId);
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=ATS_Resume_Report_${resume._id}.pdf`
    );

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    // Title
    doc
      .fontSize(22)
      .fillColor('#0056b3')
      .text('📘 ATS Resume Evaluation Report', { align: 'center', underline: true });
    doc.moveDown(1.5);

    // Candidate Summary
    doc.fontSize(14).fillColor('black').text('🧾 Candidate Summary', { underline: true });
    doc.moveDown(0.5);
    doc
      .fontSize(11)
      .list([
        `👤 Name       : ${resume.name}`,
        `🚻 Gender     : ${resume.gender}`,
        `📍 Location   : ${resume.location}`,
        `📊 Score      : ${resume.score}`
      ]);
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(1);

    // Resume Text
    doc.fontSize(14).fillColor('black').text('📄 Anonymized Resume Content', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#333333').text(resume.anonymizedText || 'No anonymized resume available', {
      lineGap: 4,
      align: 'justify'
    });
    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(1);

    // Keyword Analysis
    if (resume.keywordsMatched && resume.keywordsMissing) {
      doc.fontSize(14).fillColor('black').text('🧠 Keyword Match Analysis', { underline: true });
      doc.moveDown(0.5);

      doc.fontSize(11).fillColor('#28a745').text('✅ Matched Keywords:');
      doc.fontSize(10).fillColor('#28a745').list(resume.keywordsMatched);
      doc.moveDown(0.5);

      doc.fontSize(11).fillColor('#dc3545').text('❌ Missing Keywords:');
      doc.fontSize(10).fillColor('#dc3545').list(resume.keywordsMissing);
      doc.moveDown(1.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
      doc.moveDown(1);
    }

    // AI Suggestions
    if (resume.suggestions && resume.suggestions.length > 0) {
      doc.fontSize(14).fillColor('black').text('💡 AI Suggestions', { underline: true });
      doc.moveDown(0.5);
      
      if (Array.isArray(resume.suggestions)) {
        doc.fontSize(10).fillColor('#333333').list(resume.suggestions);
      } else {
        doc.fontSize(10).fillColor('#333333').text(resume.suggestions, {
          lineGap: 4,
          align: 'left'
        });
      }
      doc.moveDown(1.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
      doc.moveDown(1);
    }

    // Verdict
    doc.fontSize(14).fillColor('black').text('🧾 Final Verdict', { underline: true });
    let verdict = '⚠️ Low match – Major improvements needed';
    if (resume.score > 80) verdict = '✅ High match – Resume is well optimized';
    else if (resume.score > 50) verdict = '🟡 Medium match – Some improvements suggested';

    doc.fontSize(11).fillColor('black').text(verdict, { align: 'left' });

    doc.end();
  } catch (err) {
    console.error('PDF export error:', err);
    res.status(500).json({ error: 'Failed to export report' });
  }
});

module.exports = router;
