const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

async function parsePDF(buffer) {
  const data = await pdfParse(buffer);
  return data.text;
}

async function parseDOCX(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

module.exports = {
  parsePDF,
  parseDOCX
};
