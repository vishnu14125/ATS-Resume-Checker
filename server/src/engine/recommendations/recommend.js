const { RecommendationSchema } = require('../../domain/contracts/recommendation');
const { parseContract } = require('../../domain/contracts');
const { makeId } = require('../text/ids');
const { round } = require('../scoring/model');
const { RESUME_RULES } = require('./resumeRules');
const { ruleFor } = require('./jobRules');

const RECOMMENDATIONS_VERSION = '7.0.0-phase7';

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
// Resume Health points at stake that make a resume recommendation high / medium.
const RESUME_HIGH_POINTS = 6;
const RESUME_MEDIUM_POINTS = 2.5;
const RESUME_ORDER = { high: 40, medium: 60, low: 70 };

/**
 * Recommendation engine (Phase 7).
 *
 * Turns the deterministic analysis into "what should the user do next?". It
 * performs no analysis of its own: every recommendation is derived from a
 * Resume Health deduction, a requirement assessment or a knockout finding, and
 * carries the ids of those sources. Pure: no DB, network, clock or LLM.
 *
 * Job-scope recommendations are produced only when `jobMatch` is supplied.
 *
 * @param {object} input
 * @param {object} input.resumeHealth  Phase 6 ResumeHealthReport
 * @param {null|{ requirements, assessments, eligibility, score }} [input.jobMatch]  Phase 3/5/6 outputs for a job
 * @param {object[]} [input.evidence]  Phase 5 Evidence[] (required to reference evidence)
 * @returns {{ recommendationsVersion, recommendations }}
 */
function buildRecommendations({ resumeHealth, jobMatch = null, evidence = [] }) {
  const drafts = [...resumeRecommendations(resumeHealth), ...(jobMatch ? jobRecommendations(jobMatch) : [])];

  drafts.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    || a.order - b.order
    || (b.expectedImpact.scoreDelta ?? 0) - (a.expectedImpact.scoreDelta ?? 0)
    || (a.id < b.id ? -1 : 1));

  const recommendations = drafts.map(({ order, ...rec }) => parseContract(RecommendationSchema, rec, 'Recommendation'));
  assertGrounded(recommendations, { resumeHealth, jobMatch, evidence });
  return { recommendationsVersion: RECOMMENDATIONS_VERSION, recommendations };
}

// ── Resume scope ──────────────────────────────────────────────────────────────

function resumeRecommendations(resumeHealth) {
  // subject key (checkId or ruleId) → { id, message, pointsLost, failed } for subjects that lost credit
  const lost = new Map();
  const keyById = new Map([
    ...resumeHealth.checks.map((c) => [c.id, c.checkId]),
    ...resumeHealth.findings.map((f) => [f.id, f.ruleId]),
  ]);

  if (resumeHealth.score.score === null) {
    // Unreadable: nothing else about the resume can be trusted, so only the extraction problem is reported.
    const textLayer = resumeHealth.checks.find((c) => c.checkId === 'text_layer' && c.result !== 'pass');
    if (textLayer) lost.set('text_layer', { id: textLayer.id, message: textLayer.evidence, pointsLost: null, failed: true });
  } else {
    for (const d of resumeHealth.score.deductions) {
      const key = keyById.get(d.subjectId);
      if (key) lost.set(key, { id: d.subjectId, message: d.message, pointsLost: d.pointsLost, failed: d.cause === 'failed_check' });
    }
  }

  const out = [];
  for (const rule of RESUME_RULES) {
    const subjects = rule.subjects.map((s) => lost.get(s)).filter(Boolean);
    if (!subjects.length) continue; // no finding → no recommendation

    const scored = subjects.every((s) => s.pointsLost !== null);
    const points = scored ? round(subjects.reduce((sum, s) => sum + s.pointsLost, 0), 1) : null;
    const anyFailed = subjects.some((s) => s.failed);
    const priority = (rule.highWhenFailed && anyFailed) || (points ?? 0) >= RESUME_HIGH_POINTS ? 'high'
      : (points ?? 0) >= RESUME_MEDIUM_POINTS ? 'medium' : 'low';
    const findingIds = subjects.map((s) => s.id);

    out.push({
      id: makeId('rec', rule.ruleId, ...findingIds),
      ruleId: rule.ruleId,
      scope: 'resume',
      priority,
      order: RESUME_ORDER[priority],
      category: rule.category,
      issue: subjects.map((s) => s.message).join(' '),
      action: rule.action,
      rationale: rule.rationale,
      requirementIds: [],
      evidenceIds: [],
      findingIds,
      expectedImpact: points
        ? { scoreDelta: points, scoreKind: 'resume_health', description: `Accounts for up to ${points} Resume Health points.` }
        : { scoreDelta: null, scoreKind: null, description: scored ? 'Negligible effect on the Resume Health Score.' : 'The resume cannot be scored until its text can be read.' },
      integrityNote: rule.integrityNote,
      confidence: 0.9,
    });
  }
  return out;
}

// ── Job scope ─────────────────────────────────────────────────────────────────

function jobRecommendations({ requirements, assessments, eligibility, score }) {
  const assessmentById = new Map();
  for (const a of assessments) if (!assessmentById.has(a.requirementId)) assessmentById.set(a.requirementId, a);
  const findingByRequirement = new Map(eligibility.findings.map((f) => [f.requirementId, f]));
  const deductionBySubject = new Map(score.deductions.map((d) => [d.subjectId, d]));

  const out = [];
  const seenKeys = new Set();
  for (const requirement of requirements) {
    if (seenKeys.has(requirement.canonicalKey)) continue; // one recommendation per underlying requirement
    seenKeys.add(requirement.canonicalKey);

    const assessment = assessmentById.get(requirement.id);
    if (!assessment) continue;
    const finding = findingByRequirement.get(requirement.id) || null;
    const rule = ruleFor(requirement, assessment, finding);
    if (!rule) continue;

    const deduction = deductionBySubject.get(requirement.id);
    const points = deduction ? round(deduction.pointsLost, 1) : 0;
    const { order, evidenceIds, ...text } = rule;

    out.push({
      id: makeId('rec', rule.ruleId, requirement.id),
      scope: 'job',
      order,
      ...text,
      requirementIds: [requirement.id],
      evidenceIds,
      findingIds: finding ? [finding.id] : [],
      expectedImpact: points > 0
        ? { scoreDelta: points, scoreKind: 'job_match', description: `This requirement accounts for up to ${points} Job Match points, recoverable only with genuine evidence.` }
        : { scoreDelta: null, scoreKind: null, description: rule.category === 'eligibility' ? 'Does not change the Job Match Score; it affects eligibility.' : 'No measurable effect on the Job Match Score.' },
      confidence: assessment.confidence,
    });
  }
  return out;
}

// ── Grounding ─────────────────────────────────────────────────────────────────

/** Every recommendation must have a source, and every id it cites must exist. */
function assertGrounded(recommendations, { resumeHealth, jobMatch, evidence }) {
  const evidenceIds = new Set(evidence.map((e) => e.id));
  const requirementIds = new Set(jobMatch ? jobMatch.requirements.map((r) => r.id) : []);
  const findingIds = new Set([
    ...resumeHealth.checks.map((c) => c.id),
    ...resumeHealth.findings.map((f) => f.id),
    ...(jobMatch ? jobMatch.eligibility.findings.map((f) => f.id) : []),
  ]);
  const seen = new Set();

  for (const r of recommendations) {
    const fail = (message) => { throw new Error(`Ungrounded recommendation ${r.ruleId} (${r.id}): ${message}`); };
    if (seen.has(r.id)) fail('duplicate recommendation id');
    seen.add(r.id);
    if (r.requirementIds.length === 0 && r.findingIds.length === 0) fail('it has no source requirement or finding');
    for (const id of r.requirementIds) if (!requirementIds.has(id)) fail(`unknown requirement ${id}`);
    for (const id of r.evidenceIds) if (!evidenceIds.has(id)) fail(`unknown evidence ${id}`);
    for (const id of r.findingIds) if (!findingIds.has(id)) fail(`unknown finding ${id}`);
  }
}

module.exports = { buildRecommendations, assertGrounded, RECOMMENDATIONS_VERSION };
