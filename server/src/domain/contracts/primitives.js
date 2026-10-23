const { z } = require('zod/v4');

/**
 * Shared building blocks for every canonical contract.
 *
 * Conventions (enforced here and in the contracts built from these pieces):
 * - Objects are strict: unknown keys are rejected.
 * - Engine outputs use `null` for "looked for, not found"; keys are never omitted.
 * - Confidence, credits and component scores are 0..1; user-facing scores are 0..100.
 * - Ids are deterministic, prefixed strings (e.g. `req_3f9a1c`), never random.
 */

const SCHEMA_VERSION = '1';
const schemaVersion = z.literal(SCHEMA_VERSION);

const ID_PREFIXES = Object.freeze({
  requirement: 'req',
  statement: 'stm',
  evidence: 'ev',
  experience: 'exp',
  project: 'proj',
  education: 'edu',
  certification: 'cert',
  bullet: 'blt',
  section: 'sec',
  knockout: 'ko',
  recommendation: 'rec',
  finding: 'fnd',
  check: 'chk',
});

/** A deterministic id with a fixed prefix, e.g. prefixedId('req') accepts "req_a1b2". */
const prefixedId = (prefix) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]{1,64}$`), `Expected an id like "${prefix}_<hash>"`);

/** Any entry id that can own resume content. */
const entryId = z.string().regex(/^(exp|proj|edu|cert)_[A-Za-z0-9]{1,64}$/, 'Expected an experience/project/education/certification id');

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Expected a 24-character hex ObjectId');

const confidence = z.number().min(0).max(1);
const unitInterval = z.number().min(0).max(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/, 'Expected a lowercase sha256 hex digest');
const versionString = z.string().min(1).max(64);
const nonEmptyText = z.string().trim().min(1);

/** Pointer into NormalizedDocument.lines, optionally narrowed to a character span. */
const TextRefSchema = z
  .strictObject({
    lineIndex: z.number().int().min(0),
    start: z.number().int().min(0).nullable(),
    end: z.number().int().min(0).nullable(),
  })
  .check((ctx) => {
    const { start, end } = ctx.value;
    if ((start === null) !== (end === null)) {
      ctx.issues.push({ code: 'custom', input: ctx.value, message: 'start and end must both be set or both be null', path: ['end'] });
    } else if (start !== null && end <= start) {
      ctx.issues.push({ code: 'custom', input: ctx.value, message: 'end must be greater than start', path: ['end'] });
    }
  });

/** An extracted value together with where it came from and how sure we are. */
const field = (valueSchema) =>
  z.strictObject({
    value: valueSchema,
    ref: TextRefSchema,
    confidence,
  });

const PartialDateSchema = z
  .strictObject({
    year: z.number().int().min(1900).max(2200),
    month: z.number().int().min(1).max(12).nullable(),
    precision: z.enum(['month', 'year', 'season']),
  })
  .check((ctx) => {
    const { month, precision } = ctx.value;
    if (precision === 'year' && month !== null) {
      ctx.issues.push({ code: 'custom', input: ctx.value, message: 'year precision must not carry a month', path: ['month'] });
    }
    if (precision !== 'year' && month === null) {
      ctx.issues.push({ code: 'custom', input: ctx.value, message: `${precision} precision requires a month`, path: ['month'] });
    }
  });

/** Duration with uncertainty: year-only dates widen min/max around the best estimate. */
const DurationRangeSchema = z
  .strictObject({
    minMonths: z.number().min(0),
    bestMonths: z.number().min(0),
    maxMonths: z.number().min(0),
  })
  .check((ctx) => {
    const { minMonths, bestMonths, maxMonths } = ctx.value;
    if (!(minMonths <= bestMonths && bestMonths <= maxMonths)) {
      ctx.issues.push({ code: 'custom', input: ctx.value, message: 'expected minMonths <= bestMonths <= maxMonths', path: ['bestMonths'] });
    }
  });

const DateRangeSchema = z
  .strictObject({
    start: PartialDateSchema.nullable(),
    end: PartialDateSchema.nullable(),
    isCurrent: z.boolean(),
    sourceText: nonEmptyText,
    duration: DurationRangeSchema.nullable(),
  })
  .check((ctx) => {
    const { end, isCurrent } = ctx.value;
    if (isCurrent && end !== null) {
      ctx.issues.push({ code: 'custom', input: ctx.value, message: 'a current range must have end = null', path: ['end'] });
    }
  });

const confidenceLabel = z.enum(['high', 'medium', 'low']);

/** Maps a numeric confidence to its label (high ≥ 0.85, medium ≥ 0.60). */
function toConfidenceLabel(value) {
  if (value >= 0.85) return 'high';
  if (value >= 0.6) return 'medium';
  return 'low';
}

const SectionTypeSchema = z.enum([
  'header', 'summary', 'experience', 'projects', 'education', 'certifications', 'skills',
  'achievements', 'publications', 'volunteering', 'languages', 'interests', 'other',
]);

const DegreeLevelSchema = z.enum([
  'high_school', 'associate', 'bachelor', 'master', 'doctorate', 'diploma', 'certificate', 'bootcamp', 'unknown',
]);

const WarningSchema = z.strictObject({
  code: z.string().regex(/^[A-Z0-9_]+$/),
  message: nonEmptyText,
});

module.exports = {
  z,
  SCHEMA_VERSION,
  schemaVersion,
  ID_PREFIXES,
  prefixedId,
  entryId,
  objectIdString,
  confidence,
  unitInterval,
  confidenceLabel,
  toConfidenceLabel,
  sha256Hex,
  versionString,
  nonEmptyText,
  TextRefSchema,
  field,
  PartialDateSchema,
  DurationRangeSchema,
  DateRangeSchema,
  SectionTypeSchema,
  DegreeLevelSchema,
  WarningSchema,
};
