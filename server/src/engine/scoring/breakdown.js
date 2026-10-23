const { ScoreBreakdownSchema } = require('../../domain/contracts/score');
const { parseContract } = require('../../domain/contracts');
const { SCORING_MODEL_VERSION, round } = require('./model');

/**
 * Builds a contract-valid ScoreBreakdown from weighted components and items.
 *
 * Arithmetic (the whole model, shared by both scores):
 *   - A component is `evaluated` only when it has items; otherwise it carries no
 *     weight and is excluded — it is never awarded free points.
 *   - effectiveWeight = component weight ÷ Σ weights of evaluated components.
 *   - rawScore        = Σ(itemWeight × credit) ÷ Σ itemWeight.
 *   - contribution    = effectiveWeight × rawScore × 100.
 *   - score           = Σ contributions, so score + Σ deductions = 100.
 *
 * Rounding: all arithmetic is done unrounded; the score is then rounded half-up
 * to one decimal, contributions to two, and per-item points to three.
 *
 * @param {object} input
 * @param {'resume_health'|'job_match'} input.kind
 * @param {Array<{ id, weight, baseWeight?, items, emptyStatus, emptyReason, statusReason, confidence }>} input.components
 *   each item: { subjectId, itemWeight, credit, cause, message }
 * @param {{ label, reasons }} input.confidence
 * @param {string} input.nullReason  why nothing could be scored (used when no component is evaluated)
 * @param {boolean} [input.forceNull]  score nothing even if components have items
 */
function buildBreakdown({ kind, components, confidence, nullReason, forceNull = false }) {
  const isEvaluated = (c) => !forceNull && c.items.length > 0 && c.weight > 0;
  const totalWeight = components.filter(isEvaluated).reduce((sum, c) => sum + c.weight, 0);

  let exactScore = 0;
  const deductions = [];

  const built = components.map((c) => {
    if (!isEvaluated(c)) {
      return {
        id: c.id,
        status: forceNull ? 'not_evaluated' : c.emptyStatus,
        statusReason: forceNull ? nullReason : c.emptyReason,
        baseWeight: c.baseWeight ?? 0,
        effectiveWeight: 0,
        rawScore: null,
        contribution: 0,
        maxContribution: 0,
        items: [],
        confidence: 1,
      };
    }

    const effectiveWeight = c.weight / totalWeight;
    const itemWeightSum = c.items.reduce((sum, i) => sum + i.itemWeight, 0);
    const rawScore = c.items.reduce((sum, i) => sum + i.itemWeight * i.credit, 0) / itemWeightSum;
    exactScore += effectiveWeight * rawScore * 100;

    const items = c.items.map((i) => {
      const pointsLost = round(effectiveWeight * 100 * (i.itemWeight / itemWeightSum) * (1 - i.credit), 3);
      if (pointsLost > 0) deductions.push({ componentId: c.id, subjectId: i.subjectId, pointsLost, cause: i.cause, message: i.message });
      return { subjectId: i.subjectId, itemWeight: i.itemWeight, credit: round(i.credit, 4), pointsLost };
    });

    return {
      id: c.id,
      status: 'evaluated',
      statusReason: c.statusReason,
      baseWeight: round(c.baseWeight ?? effectiveWeight, 6),
      effectiveWeight: round(effectiveWeight, 6),
      rawScore: round(rawScore, 4),
      contribution: round(effectiveWeight * rawScore * 100, 2),
      maxContribution: round(effectiveWeight * 100, 2),
      items,
      confidence: c.confidence,
    };
  });

  const anyEvaluated = totalWeight > 0;
  deductions.sort((a, b) => b.pointsLost - a.pointsLost || (a.subjectId < b.subjectId ? -1 : 1));

  return parseContract(ScoreBreakdownSchema, {
    kind,
    scoringModelVersion: SCORING_MODEL_VERSION,
    score: anyEvaluated ? Math.min(100, Math.max(0, round(exactScore, 1))) : null,
    scoreReason: anyEvaluated ? null : nullReason,
    confidence,
    components: built,
    deductions: anyEvaluated ? deductions : [],
  }, 'ScoreBreakdown');
}

module.exports = { buildBreakdown };
