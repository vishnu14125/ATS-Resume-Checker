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
    throw new Error(`Failed to parse document: ${error.message}`);
  }
}

async function parsePDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    if (!data.text || data.text.trim().length === 0) {
      throw new Error('No text content found in PDF');
    }
    const cleanedText = cleanExtractedText(data.text);
    console.log(`📄 PDF parsed successfully. Pages: ${data.numpages}, Text length: ${cleanedText.length}`);
    return cleanedText;
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error('Failed to parse PDF file. Please ensure the PDF contains readable text.');
  }
}

async function parseDOCX(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value || result.value.trim().length === 0) {
      throw new Error('No text content found in DOCX');
    }
    const cleanedText = cleanExtractedText(result.value);
    console.log(`📄 DOCX parsed successfully. Text length: ${cleanedText.length}`);
    return cleanedText;
  } catch (error) {
    console.error('DOCX parsing error:', error);
    throw new Error('Failed to parse DOCX file. Please ensure the document contains readable text.');
  }
}

function parseTXT(buffer) {
  try {
    const text = buffer.toString('utf-8');
    if (!text || text.trim().length === 0) {
      throw new Error('No text content found in file');
    }
    const cleanedText = cleanExtractedText(text);
    console.log(`📄 TXT parsed successfully. Text length: ${cleanedText.length}`);
    return cleanedText;
  } catch (error) {
    console.error('TXT parsing error:', error);
    throw new Error('Failed to parse text file.');
  }
}

function cleanExtractedText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .replace(/[^\w\s\.\,\;\:\!\?\-\(\)\[\]\{\}]/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/([.,;:!?])\s*/g, '$1 ')
    .trim();
}

function validateFileSize(buffer, maxSize = 10 * 1024 * 1024) {
  if (buffer.length > maxSize) {
    throw new Error(`File size exceeds maximum limit of ${maxSize / (1024 * 1024)}MB`);
  }
  return true;
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
  const supportedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];
  return supportedTypes.includes(mimeType);
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
