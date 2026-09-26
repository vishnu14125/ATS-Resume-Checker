const Joi = require('joi');

const componentScoreSchema = Joi.object({
  score: Joi.number().min(0).max(100).required(),
  status: Joi.string().valid('good', 'average', 'poor', 'fatal', 'not_applicable').required(),
  evidence: Joi.array().items(Joi.string()).required()
});

const parseabilityWarningSchema = Joi.object({
  code: Joi.string().required(),
  severity: Joi.string().valid('fatal', 'warning', 'info').required(),
  message: Joi.string().required(),
  evidence: Joi.string().allow(null, '').optional()
});

const parseabilityResultSchema = Joi.object({
  score: Joi.number().min(0).max(100).required(),
  status: Joi.string().valid('good', 'average', 'poor', 'fatal').required(),
  
  components: Joi.object({
    textExtraction: componentScoreSchema.required(),
    sectionDetection: componentScoreSchema.required(),
    contactExtraction: componentScoreSchema.required(),
    experienceExtraction: componentScoreSchema.required(),
    educationExtraction: componentScoreSchema.required(),
    skillsExtraction: componentScoreSchema.required(),
    projectExtraction: componentScoreSchema.required(),
    structureQuality: componentScoreSchema.required()
  }).required(),

  warnings: Joi.array().items(parseabilityWarningSchema).required(),
  
  capabilities: Joi.object({
    visualLayoutAnalysis: Joi.string().valid('not_available', 'available').required(),
    ocrAnalysis: Joi.string().valid('not_available', 'available').required(),
    columnAnalysis: Joi.string().valid('not_available', 'available').required()
  }).required(),

  documentFormat: Joi.string().allow(null, '').optional(),
  limitations: Joi.array().items(Joi.string()).required()
});

module.exports = {
  parseabilityResultSchema,
  componentScoreSchema,
  parseabilityWarningSchema
};
