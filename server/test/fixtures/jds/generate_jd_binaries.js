// One-off fixture generator, not run by the tests. pdfkit is not a project dependency:
// run `npm install --no-save pdfkit` first if a fixture ever needs regenerating.
// Regenerates real binary JD fixtures (PDF via pdfkit, DOCX via JSZip) so the
// real-path tests exercise genuine files, not just text. Run: node generate_jd_binaries.js
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const JSZip = require('jszip');

const LINES = [
  'Backend Developer at DataForge',
  'Remote',
  '',
  'Responsibilities',
  '- Design and build REST APIs.',
  '- Implement authentication and authorization.',
  '',
  'Required Qualifications',
  '- 4+ years of experience with Node.js.',
  '- Proficiency with SQL and PostgreSQL is required.',
  "- Bachelor's degree in Computer Science or related field.",
  '',
  'Preferred Qualifications',
  '- Experience with Docker and AWS.',
];

function writePdf() {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(fs.createWriteStream(path.join(__dirname, 'backend_developer.pdf')));
  doc.font('Helvetica').fontSize(12);
  for (const line of LINES) (line === '' ? doc.moveDown() : doc.text(line));
  doc.end();
}

async function writeDocx() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paras = LINES.filter((l) => l !== '').map((l) => `<w:p><w:r><w:t xml:space="preserve">${esc(l)}</w:t></w:r></w:p>`).join('');
  zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paras}</w:body>
</w:document>`);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(path.join(__dirname, 'backend_developer.docx'), buf);
}

writePdf();
writeDocx().then(() => console.log('JD binaries generated.'));
