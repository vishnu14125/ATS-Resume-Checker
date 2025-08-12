const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

async function parseDocument(buffer, mimeType) {
  switch (mimeType) {
    case 'application/pdf':
      return await parsePDF(buffer);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return await parseDOCX(buffer);
    case 'text/plain':
      return parseTXT(buffer);
    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
}

async function parsePDF(buffer) {
  const data = await pdfParse(buffer);
  return data.text;
}

async function parseDOCX(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function parseTXT(buffer) {
  return buffer.toString('utf-8');
}

module.exports = {
  parseDocument,
  parsePDF,
  parseDOCX,
  parseTXT
};
