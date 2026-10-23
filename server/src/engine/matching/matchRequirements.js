const { RequirementAssessmentSchema } = require('../../domain/contracts/match');
const { parseContract } = require('../../domain/contracts');
const { buildResumeSkillIndex, matchSkill, matchSkillGroup } = require('./matchSkills');

const MATCHER_VERSION = '4.0.0-phase4';

// Requirement types that Phase 4 deliberately does not evaluate (eligibility and
// evidence engines are Phase 5). They are reported honestly as not_evaluated.
const DEFERRED_REASON = {
  experience_years: 'Experience-duration matching is handled by the eligibility engine in a later phase.',
  education: 'Education matching is handled by the eligibility engine in a later phase.',
  certification: 'Certification matching is handled by the eligibility engine in a later phase.',
  language: 'Language requirements are handled by the eligibility engine in a later phase.',
  work_authorization: 'Work-authorization requirements are handled by the eligibility engine in a later phase.',
  clearance: 'Clearance requirements are handled by the eligibility engine in a later phase.',
  responsibility: 'Responsibilities are matched by the evidence/semantic engine in a later phase, not as skills.',
};

function assess(requirement, resumeIndex) {
  if (requirement.type === 'skill') {
    const r = matchSkill(requirement.params.skillId, resumeIndex);
    return finalize(requirement.id, r);
  }
  if (requirement.type === 'skill_group') {
    const r = matchSkillGroup(requirement.params.anyOf, resumeIndex);
    return finalize(requirement.id, r);
  }
  // Non-skill requirement: not evaluated in Phase 4.
  return {
    requirementId: requirement.id,
    status: 'not_evaluated',
    statusReason: DEFERRED_REASON[requirement.type] || 'Not evaluated in this phase.',
    credit: 0,
    best: null,
    alternatives: [],
    details: { kind: 'none' },
    confidence: 1.0,
  };
}

function finalize(requirementId, r) {
  return {
    requirementId,
    status: r.status,
    statusReason: r.statusReason,
    credit: r.credit,
    best: r.best,
    alternatives: r.alternatives,
    details: { kind: 'none' },
    confidence: r.confidence,
  };
}

/**
 * Deterministically matches a resume against a job's requirements.
 *
 * Phase 4 evaluates skill and skill_group requirements via the canonical
 * taxonomy; all other requirement types are returned as not_evaluated. Produces
 * contract-valid RequirementAssessment[] — no scoring, no eligibility, no
 * recommendations (those are later phases).
 *
 * @param {object} resumeProfile  a validated ResumeProfile
 * @param {object} jobProfile  a validated JobProfile
 * @returns {{ matcherVersion, taxonomyVersion, assessments, summary }}
 */
function matchRequirements(resumeProfile, jobProfile) {
  const { TAXONOMY_VERSION } = require('../taxonomy/taxonomy');
  const resumeIndex = buildResumeSkillIndex(resumeProfile);

  const assessments = jobProfile.requirements.map((req) =>
    parseContract(RequirementAssessmentSchema, assess(req, resumeIndex), 'RequirementAssessment'));

  const skillAssessments = assessments.filter((a, i) => jobProfile.requirements[i].type === 'skill' || jobProfile.requirements[i].type === 'skill_group');
  const summary = {
    totalRequirements: assessments.length,
    skillRequirements: skillAssessments.length,
    met: skillAssessments.filter((a) => a.status === 'met').length,
    partiallyMet: skillAssessments.filter((a) => a.status === 'partially_met').length,
    missing: skillAssessments.filter((a) => a.status === 'missing').length,
    notEvaluated: assessments.filter((a) => a.status === 'not_evaluated').length,
  };

  return { matcherVersion: MATCHER_VERSION, taxonomyVersion: TAXONOMY_VERSION, assessments, summary };
}

module.exports = { matchRequirements, MATCHER_VERSION };
