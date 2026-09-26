const fs = require('fs');
const { parseDocument } = require('./services/documentService');

async function testPdf() {
  try {
    const filePath = 'dummy.pdf';
    if (!fs.existsSync(filePath)) {
      console.log('File not found:', filePath);
      return;
    }
    const buffer = fs.readFileSync(filePath);
    console.log('File size:', buffer.length);
    const text = await parseDocument(buffer, 'application/pdf');
    console.log('Extracted char count:', text.length);
    console.log('Extracted text:', text.substring(0, 200));
  } catch (err) {
    console.error('Extraction failed:', err);
  }
}
testPdf();
