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
  const data = await pdfParse(buffer);
  return cleanExtractedText(data.text);
}

async function parseDOCX(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return cleanExtractedText(result.value);
}

function parseTXT(buffer) {
  return cleanExtractedText(buffer.toString('utf-8'));
}

function cleanExtractedText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function validateFileSize(buffer, maxSize = 10 * 1024 * 1024) {
  if (buffer.length > maxSize) {
    throw new Error(`File exceeds ${maxSize / (1024 * 1024)}MB`);
  }
}

function getFileInfo(buffer, originalName, mimeType) {
  return {
    name: originalName,
    size: buffer.length,
    sizeInMB: (buffer.length / (1024 * 1024)).toFixed(2),
    type: mimeType,
    extension: getFileExtension(originalName)
  };
}

function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

function isSupportedFileType(mimeType) {
  return [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ].includes(mimeType);
}

module.exports = {
  parseDocument,
  parsePDF,
  parseDOCX,
  parseTXT,
  validateFileSize,
  getFileInfo,
  isSupportedFileType
};
