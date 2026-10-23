const multer = require('multer');
const { AppError } = require('../../shared/errors');
const { DEFAULT_MAX_BYTES } = require('../../documents/fileValidation');

const MAX_TEXT_FIELD_BYTES = 1024 * 1024;

/**
 * Multipart document upload held in memory only: nothing is written to disk, so
 * there are no temporary files to clean up on any success or failure path. The
 * buffers are released with the request.
 *
 * File type is not judged here (the client-supplied MIME type is not trusted);
 * ingestion validates the actual bytes. Text fields are passed through untouched.
 * Non-multipart requests (e.g. JSON) pass straight through.
 *
 * @param {{ fields: string[], maxBytes?: number }} options  accepted file fields, one file each
 */
function createDocumentUpload({ fields, maxBytes = DEFAULT_MAX_BYTES }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: fields.length, fields: 10, fieldSize: MAX_TEXT_FIELD_BYTES, parts: fields.length + 10 },
  }).fields(fields.map((name) => ({ name, maxCount: 1 })));

  const toAppError = (err) => {
    const field = err && err.field ? String(err.field).slice(0, 60) : null;
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return new AppError('PAYLOAD_TOO_LARGE', { message: `The file exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB limit.`, details: { field } });
      }
      if (err.code === 'LIMIT_FIELD_VALUE') return new AppError('PAYLOAD_TOO_LARGE', { message: 'A text field in the upload is too large.', details: { field } });
      if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
        return new AppError('VALIDATION_ERROR', { message: `Unexpected file upload. Send at most one file in each of these fields: ${fields.join(', ')}.`, details: { field } });
      }
    }
    return new AppError('VALIDATION_ERROR', { message: 'The upload is malformed and could not be read.' });
  };

  return (req, res, next) => upload(req, res, (err) => (err ? next(toAppError(err)) : next()));
}

module.exports = { createDocumentUpload };
