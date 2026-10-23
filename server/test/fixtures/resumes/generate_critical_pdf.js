// One-off fixture generator, not run by the tests. pdfkit is not a project dependency:
// run `npm install --no-save pdfkit` first if a fixture ever needs regenerating.
// Regenerate critical_tokens.pdf: a real PDF whose text exercises the extraction
// regression (email, URLs, C++/C#, %, $, en-dash dates, bullets). Run: node generate_critical_pdf.js
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const lines = [
  'Jordan Blake',
  'jordan.blake@example.com',
  'https://github.com/jordanblake',
  '',
  'SKILLS',
  'C++',
  'C#',
  'JavaScript',
  'React / Node.js',
  '',
  'EXPERIENCE',
  'Software Engineer, Example Corp',
  '2024 – 2026',
  'Improved conversion by 95%.',
  'Reduced cloud spend by $20,000.',
];

const doc = new PDFDocument({ size: 'A4', margin: 50 });
doc.pipe(fs.createWriteStream(path.join(__dirname, 'critical_tokens.pdf')));
doc.font('Helvetica').fontSize(12);
for (const line of lines) {
  if (line === '') doc.moveDown();
  else doc.text(line);
}
doc.end();
