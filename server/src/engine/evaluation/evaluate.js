const { parseContract } = require('../../domain/contracts');
const { RequirementAssessmentSchema } = require('../../domain/contracts/match');
const { KnockoutFindingSchema, EligibilitySchema, deriveEligibilityStatus } = require('../../domain/contracts/eligibility');
const { evidenceIdFor } = require('../matching/matchSkills');
const taxonomy = require('../taxonomy/taxonomy');
const { makeId } = require('../text/ids');
const { createEvidenceRegistry } = require('./evidence');
const { evaluateExperience } = require('./experience');
const { evaluateEducation } = require('./education');
const { evaluateCertification } = require('./certification');
const { evaluateLanguage, evaluateWorkAuthorization, evaluateClearance } = require('./credentials');

const EVALUATOR_VERSION = '5.0.0-phase5';

/**
 * Evidence + Eligibility + Knockout engine (Phase 5).
 *
 * Takes a parsed resume and job plus the Phase 4 skill assessments, and:
 *   1. grounds every referenced match in real, verbatim resume Evidence;
 *   2. enriches the assessments Phase 4 deferred (experience, education,
 *      certification, language, work authorization, clearance) with a real
 *      status, supporting evidence and type-specific details;
 *   3. derives explicit, conservative knockout findings and an overall
 *      eligibility verdict.
 *
 * Pure and deterministic: no DB, network, clock or LLM. The reference date is
 * injected. Absence of evidence is reported as `insufficient_evidence` /
 * `unknown`, never as a failure, and a missing skill is never a knockout.
 *
 * @returns {{ evaluatorVersion, evidence, assessments, eligibility, summary }}
 */
function evaluateEligibility({ normalizedDocument, resumeProfile, jobProfile, assessments, referenceDate }) {
  const registry = createEvidenceRegistry({ normalizedDocument, resumeProfile, referenceDate });
  const phase4ById = new Map(assessments.map((a) => [a.requirementId, a]));

  // Ground the evidence that Phase 4 skill matches already reference.
  const mentionByEvId = new Map();
  for (const m of resumeProfile.skillMentions) {
    if (taxonomy.isKnown(m.skillId)) mentionByEvId.set(evidenceIdFor(m), m);
  }
  const groundMatch = (match) => {
    if (!match) return;
    for (const id of match.evidenceIds) {
      const mention = mentionByEvId.get(id);
      if (!mention) throw new Error(`Phase 5 cannot ground evidence ${id}: no matching resume skill mention`);
      registry.skillEvidence(mention);
    }
  };

  const finalAssessments = [];
  const findings = [];

  for (const requirement of jobProfile.requirements) {
    const result = evaluateRequirement(requirement, { resumeProfile, normalizedDocument, registry, phase4ById, groundMatch });
    finalAssessments.push(parseContract(RequirementAssessmentSchema, result.assessment, 'RequirementAssessment'));
    if (result.finding) {
      findings.push(parseContract(KnockoutFindingSchema, {
        id: makeId('ko', result.finding.requirementId, result.finding.kind),
        ...result.finding,
      }, 'KnockoutFinding'));
    }
  }

  const eligibility = buildEligibility(findings);
  const evidence = registry.list();
  assertReferentialIntegrity({ evidence, assessments: finalAssessments, findings });

  return {
    evaluatorVersion: EVALUATOR_VERSION,
    evidence,
    assessments: finalAssessments,
    eligibility,
    summary: summarize(finalAssessments, eligibility),
  };
}

/** Routes one requirement to its evaluator, or keeps the Phase 4 assessment. */
function evaluateRequirement(requirement, ctx) {
  const { resumeProfile, normalizedDocument, registry, phase4ById, groundMatch } = ctx;
  switch (requirement.type) {
    case 'experience_years': return evaluateExperience(requirement, resumeProfile, registry);
    case 'education': return evaluateEducation(requirement, resumeProfile, registry);
    case 'certification': return evaluateCertification(requirement, resumeProfile, registry);
    case 'language': return evaluateLanguage(requirement, resumeProfile, registry);
    case 'work_authorization': return evaluateWorkAuthorization(requirement, normalizedDocument, registry);
    case 'clearance': return evaluateClearance(requirement, normalizedDocument, registry);
    default: {
      // skill, skill_group, location, responsibility — keep the Phase 4 verdict,
      // grounding whatever evidence its matches reference. A missing required
      // skill is intentionally NOT turned into a knockout.
      const assessment = phase4ById.get(requirement.id);
      if (!assessment) throw new Error(`No Phase 4 assessment for requirement ${requirement.id}`);
      groundMatch(assessment.best);
      assessment.alternatives.forEach(groundMatch);
      return { assessment, finding: null };
    }
  }
}

function buildEligibility(findings) {
  const status = deriveEligibilityStatus(findings);
  const reasons = status === 'clear'
    ? []
    : dedupe(findings.filter((f) => f.outcome !== 'passed').map((f) => f.explanation));
  return parseContract(EligibilitySchema, { status, reasons, findings }, 'Eligibility');
}

/** Every evidence id referenced by an assessment or finding must be grounded. */
function assertReferentialIntegrity({ evidence, assessments, findings }) {
  const ids = new Set(evidence.map((e) => e.id));
  const check = (list, where) => list.forEach((id) => {
    if (!ids.has(id)) throw new Error(`Phase 5 referential integrity: ${where} references ungrounded evidence ${id}`);
  });
  for (const a of assessments) {
    if (a.best) check(a.best.evidenceIds, `assessment ${a.requirementId}.best`);
    a.alternatives.forEach((m) => check(m.evidenceIds, `assessment ${a.requirementId}.alternatives`));
  }
  for (const f of findings) check(f.evidenceIds, `finding ${f.id}`);
}

function summarize(assessments, eligibility) {
  const by = (status) => assessments.filter((a) => a.status === status).length;
  return {
    totalRequirements: assessments.length,
    met: by('met'),
    partiallyMet: by('partially_met'),
    missing: by('missing'),
    insufficientEvidence: by('insufficient_evidence'),
    notEvaluated: by('not_evaluated'),
    eligibility: eligibility.status,
    knockouts: eligibility.findings.filter((f) => f.outcome === 'failed').length,
  };
}

const dedupe = (arr) => [...new Set(arr)];

module.exports = { evaluateEligibility, EVALUATOR_VERSION };
