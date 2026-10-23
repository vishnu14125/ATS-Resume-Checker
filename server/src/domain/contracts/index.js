const primitives = require('./primitives');
const document = require('./document');
const resumeProfile = require('./resumeProfile');
const requirement = require('./requirement');
const jobProfile = require('./jobProfile');
const evidence = require('./evidence');
const match = require('./match');
const eligibility = require('./eligibility');
const score = require('./score');
const resumeHealth = require('./resumeHealth');
const recommendation = require('./recommendation');
const analysis = require('./analysis');
const ai = require('./ai');

/** Raised when data crossing a module boundary does not satisfy its contract. */
class ContractViolationError extends Error {
  constructor(contractName, issues) {
    super(`${contractName} contract violated: ${issues.slice(0, 5).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`);
    this.name = 'ContractViolationError';
    this.contractName = contractName;
    this.issues = issues;
  }
}

/**
 * Validates `value` against a contract at a module boundary and returns the parsed
 * value. Callers must continue with the returned value, never the input.
 */
function parseContract(schema, value, contractName) {
  const result = schema.safeParse(value);
  if (!result.success) throw new ContractViolationError(contractName, result.error.issues);
  return result.data;
}

/** JSON Schema (draft 2020-12) for a contract, e.g. for LLM structured output or OpenAPI. */
function toJsonSchema(schema) {
  return primitives.z.toJSONSchema(schema, { unrepresentable: 'any' });
}

module.exports = {
  CONTRACT_SCHEMA_VERSION: primitives.SCHEMA_VERSION,
  ContractViolationError,
  parseContract,
  toJsonSchema,
  toConfidenceLabel: primitives.toConfidenceLabel,
  ID_PREFIXES: primitives.ID_PREFIXES,

  TextRefSchema: primitives.TextRefSchema,
  PartialDateSchema: primitives.PartialDateSchema,
  DateRangeSchema: primitives.DateRangeSchema,
  DurationRangeSchema: primitives.DurationRangeSchema,

  NormalizedDocumentSchema: document.NormalizedDocumentSchema,
  ResumeProfileSchema: resumeProfile.ResumeProfileSchema,
  SkillMentionSchema: resumeProfile.SkillMentionSchema,
  RequirementSchema: requirement.RequirementSchema,
  REQUIREMENT_TYPES: requirement.REQUIREMENT_TYPES,
  JobProfileSchema: jobProfile.JobProfileSchema,
  StatementSchema: jobProfile.StatementSchema,
  EvidenceSchema: evidence.EvidenceSchema,
  MatchResultSchema: match.MatchResultSchema,
  RequirementAssessmentSchema: match.RequirementAssessmentSchema,
  KnockoutFindingSchema: eligibility.KnockoutFindingSchema,
  EligibilitySchema: eligibility.EligibilitySchema,
  deriveEligibilityStatus: eligibility.deriveEligibilityStatus,
  ScoreBreakdownSchema: score.ScoreBreakdownSchema,
  COMPONENT_IDS: score.COMPONENT_IDS,
  ResumeHealthReportSchema: resumeHealth.ResumeHealthReportSchema,
  RecommendationSchema: recommendation.RecommendationSchema,
  AnalysisRequestSchema: analysis.AnalysisRequestSchema,
  AnalysisResultSchema: analysis.AnalysisResultSchema,
  resolveAnalysisMode: analysis.resolveAnalysisMode,
  JOB_TEXT_MAX_CHARS: analysis.JOB_TEXT_MAX_CHARS,
  AI_TASKS: ai.AI_TASKS,
  AiTaskResultSchema: ai.AiTaskResultSchema,
  AiEnrichmentSchema: ai.AiEnrichmentSchema,
};
