const Joi = require('joi');

const evidenceStrengthSchema = Joi.string().valid(
  'experience',
  'projects',
  'certifications',
  'education',
  'skills',
  'summary',
  'other',
  'none'
);

const matchTypeSchema = Joi.string().valid(
  'exact',
  'normalized',
  'alias',
  'semantic', // reserved for Phase 5F
  'missing'
);

const statusSchema = Joi.string().valid(
  'MATCHED',
  'PARTIAL',
  'MISSING',
  'NOT_APPLICABLE',
  'UNKNOWN'
);

const resumeEvidenceSchema = Joi.object({
  text: Joi.string().allow(null, ''),
  section: evidenceStrengthSchema,
  sourceId: Joi.string().allow(null, ''),
  sourceType: Joi.string().allow(null, '')
}).allow(null);

const evidenceRecordSchema = Joi.object({
  requirementId: Joi.string().required(),
  requirement: Joi.string().required(),
  required: Joi.boolean().required(),
  category: Joi.string().allow(null, ''),
  canonical: Joi.string().allow(null, ''),
  originalRequirement: Joi.string().allow(null, ''),

  resumeEvidence: resumeEvidenceSchema,

  matchType: matchTypeSchema.required(),
  evidenceStrength: evidenceStrengthSchema.required(),
  confidence: Joi.number().min(0).max(100).required(),

  status: statusSchema.required()
});

module.exports = {
  evidenceRecordSchema,
  evidenceStrengthSchema,
  matchTypeSchema,
  statusSchema
};
