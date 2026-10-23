const { z } = require('zod/v4');
const { AppError } = require('../../../shared/errors');
const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('../../../application/analysis/analysisService');
const { AI_TASKS } = require('../../../domain/contracts/ai');

/**
 * Text fields are validated as strings and nothing more: no trimming, no
 * whitespace collapsing, no character stripping, no truncation. Line structure
 * and characters such as + # @ % must reach ingestion exactly as sent.
 */
const CreateAnalysisBodySchema = z.strictObject({
  resumeText: z.string({ error: 'resumeText must be a string.' }).optional(),
  jobText: z.string({ error: 'jobText must be a string.' }).optional(),
});

const AnalysisParamsSchema = z.strictObject({ analysisId: z.string().min(1).max(64) });

const ListAnalysesQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().regex(/^[a-f\d]{24}$/i, 'cursor is not valid.').optional(),
});

const RunAiTaskBodySchema = z.strictObject({
  task: z.enum(AI_TASKS, { error: `task must be one of: ${AI_TASKS.join(', ')}.` }),
  regenerate: z.boolean().default(false),
});

const DOCUMENTS = [
  { key: 'resume', fileField: 'resume', textField: 'resumeText', name: 'resume' },
  { key: 'job', fileField: 'job', textField: 'jobText', name: 'job description' },
];

/**
 * Turns a validated body plus uploaded files into the analysis input:
 * `{ resume: source, job: source | null }`, each source `{ file }` or `{ text }`.
 *
 * A resume is required; a job description is optional. Each document comes as a
 * file or as text, never both. A blank text field means "not provided" (HTML
 * forms submit empty fields), but text that is provided is forwarded unchanged.
 */
function buildAnalysisInput(body, files) {
  const issues = [];
  const input = {};

  for (const { key, fileField, textField, name } of DOCUMENTS) {
    const file = files && files[fileField] ? files[fileField][0] : null;
    const text = typeof body[textField] === 'string' && body[textField].trim() !== '' ? body[textField] : null;
    if (file && text !== null) {
      issues.push({ path: `body.${textField}`, message: `Send the ${name} either as a file ("${fileField}") or as text ("${textField}"), not both.`, code: 'custom' });
    }
    input[key] = file ? { file: { buffer: file.buffer, filename: file.originalname } } : text !== null ? { text } : null;
  }

  if (!input.resume) {
    issues.push({ path: 'body.resume', message: 'A resume is required: upload a file in the "resume" field or send "resumeText".', code: 'custom' });
  }
  if (issues.length) throw new AppError('VALIDATION_ERROR', { details: { issues } });
  return input;
}

module.exports = { CreateAnalysisBodySchema, AnalysisParamsSchema, ListAnalysesQuerySchema, RunAiTaskBodySchema, buildAnalysisInput };
