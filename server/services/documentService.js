const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

async function parseDocument(buffer, mimeType) {
  try {
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
  } catch (error) {
    console.error('Document parsing error:', error);
    throw error;
  }
}

async function parsePDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    return cleanExtractedText(data.text);
  } catch (error) {
    throw new Error('Failed to parse PDF');
  }
}

async function parseDOCX(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return cleanExtractedText(result.value);
  } catch (error) {
    throw new Error('Failed to parse DOCX');
  }
}

function parseTXT(buffer) {
  try {
    return cleanExtractedText(buffer.toString('utf-8'));
  } catch {
    throw new Error('Failed to parse TXT');
  }
}

function cleanExtractedText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

module.exports = {
  parseDocument,
  parsePDF,
  parseDOCX,
  parseTXT
};
