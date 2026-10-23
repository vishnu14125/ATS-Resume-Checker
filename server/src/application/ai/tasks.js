const { z } = require('zod/v4');
const { toJsonSchema } = require('../../domain/contracts');
const { WITHHELD, createCleaner, buildVocabulary, findUnsupportedClaims } = require('./grounding');
const { PROMPT_VERSION, systemPromptFor } = require('./prompts');

/**
 * The AI tasks. Each task is three deterministic steps around one model call:
 *
 *   buildContext(result) → the minimum structured facts the task needs, taken
 *                          from a stored AnalysisResult (never the raw document),
 *                          plus the ids and vocabulary the output may use;
 *   modelSchema          → the exact JSON shape the model must return;
 *   ground(output, ctx)  → removes every item that cites an id it was not given,
 *                          cites an id of the wrong kind, or makes a claim the
 *                          facts do not support. Throws if nothing sound is left.
 *
 * A task can explain and rephrase. It cannot add a requirement, an evidence item
 * or a recommendation, and nothing it returns is read by the analysis engine.
 */

const ELIGIBILITY_TYPES = new Set(['clearance', 'work_authorization', 'language', 'location']);
const IMPORTANCE_RANK = { required: 0, preferred: 1, contextual: 2 };
const STRONG_COMPONENT_SCORE = 85;
const COMPONENT_WORDS = 'parseability structure technical content impact completeness resume health job match score';
const CONDITIONAL = /\b(?:if|only|where|when|unless|provided)\b|\b(?:genuine(?:ly)?|truthful(?:ly)?|accurate(?:ly)?|actual(?:ly)?|verif(?:y|ied|iable))\b/i;

class UngroundedOutputError extends Error {
  constructor(message, dropped = 0) {
    super(message);
    this.name = 'UngroundedOutputError';
    this.dropped = dropped;
  }
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/** A trimmed, non-empty string within `max` characters, or null. */
const tidy = (value, max) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= max ? text : null;
};

/** Vocabulary of every fact in a task input (ids excluded: they are references, not content). */
function vocabularyOf(input, extraTexts = []) {
  const texts = [...extraTexts];
  const numbers = [];
  const walk = (value, key) => {
    if (typeof value === 'string') { if (!/^(?:id|\w*Ids?)$/.test(key)) texts.push(value); }
    else if (typeof value === 'number') numbers.push(value);
    else if (Array.isArray(value)) value.forEach((v) => walk(v, key));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, k));
  };
  walk(input, '');
  return buildVocabulary({ texts, numbers });
}

/** Maps items through `keep`; an item for which it returns null is counted as dropped. */
function pick(items, max, counter, keep) {
  const out = [];
  for (const item of items) {
    const kept = keep(item);
    if (kept) out.push(kept); else counter.dropped += 1;
  }
  return out.slice(0, max);
}

const supported = (text, vocab, options) => findUnsupportedClaims(text, vocab, options).length === 0;

/** `{ text, sourceIds }` if the text is supported and every cited id is allowed for this list. */
function groundedText(item, allowedIds, vocab) {
  const text = tidy(item.text, 400);
  const sourceIds = [...new Set(item.sourceIds)];
  if (!text || sourceIds.length === 0 || sourceIds.length > 8) return null;
  if (!sourceIds.every((id) => allowedIds.has(id))) return null;
  return supported(text, vocab) ? { text, sourceIds } : null;
}

function groundedSummary(value, vocab) {
  const summary = tidy(value, 700);
  if (!summary) throw new UngroundedOutputError('The summary is empty or too long.');
  if (!supported(summary, vocab)) throw new UngroundedOutputError('The summary makes a claim the supplied facts do not support.');
  return summary;
}

function requireSome(count, counter) {
  if (count === 0) throw new UngroundedOutputError('No grounded content remained after validation.', counter.dropped);
}

const byImportance = (a, b) => IMPORTANCE_RANK[a.r.importance] - IMPORTANCE_RANK[b.r.importance];

/** The (cleaned) evidence an assessment cites: id + verbatim snippet. */
function citedEvidence(assessment, evidenceById, clean) {
  const ids = assessment && assessment.best ? assessment.best.evidenceIds.slice(0, 1) : [];
  return ids.map((id) => evidenceById.get(id)).filter(Boolean).map((e) => ({ id: e.id, text: clean(e.snippet) }));
}

const str = z.string();
const idList = z.array(z.string());
const citedItem = z.strictObject({ text: str, sourceIds: idList });

// ── Tasks ────────────────────────────────────────────────────────────────────

const resumeExplanation = {
  modelSchema: z.strictObject({
    summary: str,
    strengths: z.array(citedItem),
    improvements: z.array(z.strictObject({ text: str, why: str, sourceIds: idList })),
  }),

  buildContext(result) {
    const { clean, stats } = createCleaner();
    const health = result.resumeHealth;
    const { score } = health;

    const components = score.components.map((c) => ({ id: c.id, status: c.status, score: c.rawScore === null ? null : Math.round(c.rawScore * 100) }));
    const passedChecks = health.checks.filter((c) => c.result === 'pass').slice(0, 12).map((c) => ({ id: c.id, text: clean(c.evidence) }));
    const issues = score.score !== null
      ? score.deductions.slice(0, 12).map((d) => ({ id: d.subjectId, component: d.componentId, pointsLost: d.pointsLost, text: clean(d.message) }))
      : health.checks.filter((c) => c.result === 'fail' || c.result === 'warn').map((c) => ({ id: c.id, component: 'parseability', pointsLost: null, text: clean(c.evidence) }));
    const recommendations = result.recommendations.filter((r) => r.scope === 'resume').slice(0, 8)
      .map((r) => ({ id: r.id, priority: r.priority, issue: clean(r.issue), action: clean(r.action) }));

    const input = { resumeHealth: { score: score.score, readability: health.readability, components }, passedChecks, issues, recommendations };
    const scored = components.filter((c) => c.score !== null);
    return {
      input,
      withheld: stats.withheld,
      vocab: vocabularyOf(input, [COMPONENT_WORDS]),
      allowed: {
        strengths: new Set([...passedChecks.map((c) => c.id), ...scored.filter((c) => c.score >= STRONG_COMPONENT_SCORE).map((c) => c.id)]),
        // An improvement may cite a component that scores low or that has a recorded issue,
        // even when its overall score is high (a strong component can still have lost points).
        improvements: new Set([
          ...issues.map((i) => i.id), ...recommendations.map((r) => r.id), ...issues.map((i) => i.component),
          ...scored.filter((c) => c.score < STRONG_COMPONENT_SCORE).map((c) => c.id),
        ]),
      },
    };
  },

  ground(model, ctx) {
    const counter = { dropped: 0 };
    const summary = groundedSummary(model.summary, ctx.vocab);
    const strengths = pick(model.strengths, 6, counter, (item) => groundedText(item, ctx.allowed.strengths, ctx.vocab));
    const improvements = pick(model.improvements, 8, counter, (item) => {
      const base = groundedText(item, ctx.allowed.improvements, ctx.vocab);
      const why = tidy(item.why, 300);
      return base && why && supported(why, ctx.vocab) ? { text: base.text, why, sourceIds: base.sourceIds } : null;
    });
    requireSome(strengths.length + improvements.length, counter);
    return { output: { summary, strengths, improvements }, dropped: counter.dropped };
  },
};

const JOB_LISTS = ['matched', 'partial', 'missing', 'insufficientEvidence', 'eligibility'];

const jobMatchExplanation = {
  modelSchema: z.strictObject({
    summary: str,
    matched: z.array(citedItem),
    partial: z.array(citedItem),
    missing: z.array(citedItem),
    insufficientEvidence: z.array(citedItem),
    eligibility: z.array(citedItem),
  }),

  buildContext(result) {
    if (result.mode !== 'job_match') return { notApplicable: 'requires_job_description' };
    const { clean, stats } = createCleaner();
    const jm = result.jobMatch;
    const assessmentBy = new Map(jm.assessments.map((a) => [a.requirementId, a]));
    const evidenceBy = new Map(result.evidence.map((e) => [e.id, e]));
    const lostBy = new Map(jm.score.deductions.map((d) => [d.subjectId, d.pointsLost]));

    const evaluated = jm.requirements.map((r) => ({ r, a: assessmentBy.get(r.id) }))
      .filter(({ a }) => a && a.status !== 'not_evaluated').sort(byImportance).slice(0, 40);
    if (evaluated.length === 0) return { notApplicable: 'no_grounded_data' };

    const requirements = evaluated.map(({ r, a }) => ({
      id: r.id, name: clean(r.displayName), type: r.type, importance: r.importance, status: a.status,
      detail: clean(a.statusReason), pointsLost: lostBy.get(r.id) ?? 0, evidence: citedEvidence(a, evidenceBy, clean),
    }));
    const count = (status) => jm.assessments.filter((a) => a.status === status).length;
    const concerns = jm.eligibility.findings.filter((f) => f.outcome !== 'passed')
      .map((f) => ({ id: f.id, requirementId: f.requirementId, kind: f.kind, outcome: f.outcome, text: clean(f.explanation) }));
    const recommendations = result.recommendations.filter((r) => r.scope === 'job').slice(0, 8)
      .map((r) => ({ id: r.id, priority: r.priority, issue: clean(r.issue), requirementIds: r.requirementIds }));

    const input = {
      jobMatch: {
        score: jm.score.score,
        counts: { met: count('met'), partiallyMet: count('partially_met'), missing: count('missing'), insufficientEvidence: count('insufficient_evidence'), notEvaluated: count('not_evaluated') },
      },
      eligibility: { status: jm.eligibility.status, concerns },
      requirements,
      recommendations,
    };

    // Each list may only cite requirements of the matching status (and their evidence / recommendations).
    const idsFor = (status) => {
      const ids = new Set();
      for (const q of requirements.filter((x) => x.status === status)) { ids.add(q.id); q.evidence.forEach((e) => ids.add(e.id)); }
      for (const rec of recommendations) if (status !== 'met' && rec.requirementIds.some((id) => ids.has(id))) ids.add(rec.id);
      return ids;
    };
    return {
      input,
      withheld: stats.withheld,
      vocab: vocabularyOf(input, [COMPONENT_WORDS]),
      allowed: {
        matched: idsFor('met'),
        partial: idsFor('partially_met'),
        missing: idsFor('missing'),
        insufficientEvidence: idsFor('insufficient_evidence'),
        eligibility: new Set([
          ...concerns.flatMap((c) => [c.id, c.requirementId]),
          ...requirements.filter((q) => ELIGIBILITY_TYPES.has(q.type)).map((q) => q.id),
        ]),
      },
    };
  },

  ground(model, ctx) {
    const counter = { dropped: 0 };
    const output = { summary: groundedSummary(model.summary, ctx.vocab) };
    for (const list of JOB_LISTS) {
      output[list] = pick(model[list], list === 'eligibility' ? 4 : 8, counter, (item) => groundedText(item, ctx.allowed[list], ctx.vocab));
    }
    requireSome(JOB_LISTS.reduce((n, list) => n + output[list].length, 0), counter);
    return { output, dropped: counter.dropped };
  },
};

const recommendationWording = {
  modelSchema: z.strictObject({
    items: z.array(z.strictObject({ recommendationId: str, explanation: str, action: str, rationale: str })),
  }),

  buildContext(result) {
    if (result.recommendations.length === 0) return { notApplicable: 'no_grounded_data' };
    const { clean, stats } = createCleaner();
    const evidenceBy = new Map(result.evidence.map((e) => [e.id, e]));
    const recommendations = result.recommendations.slice(0, 12).map((r) => ({
      id: r.id, scope: r.scope, priority: r.priority, category: r.category,
      issue: clean(r.issue), action: clean(r.action), rationale: clean(r.rationale), integrityNote: r.integrityNote,
      evidence: r.evidenceIds.slice(0, 2).map((id) => evidenceBy.get(id)).filter(Boolean).map((e) => ({ id: e.id, text: clean(e.snippet) })),
    }));
    const input = { recommendations };
    return { input, withheld: stats.withheld, vocab: vocabularyOf(input), byId: new Map(recommendations.map((r) => [r.id, r])) };
  },

  ground(model, ctx) {
    const counter = { dropped: 0 };
    const seen = new Set();
    const items = pick(model.items, 15, counter, (item) => {
      const original = ctx.byId.get(item.recommendationId);
      if (!original || seen.has(original.id)) return null; // unknown id = an invented recommendation
      const explanation = tidy(item.explanation, 500);
      const action = tidy(item.action, 500);
      const rationale = tidy(item.rationale, 300);
      if (!explanation || !action || !rationale) return null;
      if (![explanation, action, rationale].every((text) => supported(text, ctx.vocab))) return null;
      // A conditional action ("if you have genuine experience…") must stay conditional.
      if (CONDITIONAL.test(original.action) && !CONDITIONAL.test(action)) return null;
      seen.add(original.id);
      return { recommendationId: original.id, explanation, action, rationale };
    });
    requireSome(items.length, counter);
    return { output: { items }, dropped: counter.dropped };
  },
};

const interviewPrep = {
  modelSchema: z.strictObject({
    topics: z.array(z.strictObject({ topic: str, why: str, sourceIds: idList })),
    questions: z.array(z.strictObject({ question: str, basisType: z.enum(['requirement', 'resume_evidence']), basisId: str })),
  }),

  buildContext(result) {
    if (result.mode !== 'job_match') return { notApplicable: 'requires_job_description' };
    const { clean, stats } = createCleaner();
    const jm = result.jobMatch;
    const assessmentBy = new Map(jm.assessments.map((a) => [a.requirementId, a]));
    const evidenceBy = new Map(result.evidence.map((e) => [e.id, e]));

    const requirements = jm.requirements.filter((r) => !ELIGIBILITY_TYPES.has(r.type))
      .map((r) => ({ r, a: assessmentBy.get(r.id) })).sort(byImportance).slice(0, 30)
      .map(({ r, a }) => ({
        id: r.id, name: clean(r.displayName), type: r.type, importance: r.importance,
        status: a ? a.status : 'not_evaluated', evidence: citedEvidence(a, evidenceBy, clean),
      }));
    if (requirements.length === 0) return { notApplicable: 'no_grounded_data' };

    const input = { requirements };
    const requirementIds = new Set(requirements.map((q) => q.id));
    const evidenceIds = new Set(requirements.flatMap((q) => q.evidence.map((e) => e.id)));
    return { input, withheld: stats.withheld, vocab: vocabularyOf(input), requirementIds, evidenceIds };
  },

  ground(model, ctx) {
    const counter = { dropped: 0 };
    const anyId = new Set([...ctx.requirementIds, ...ctx.evidenceIds]);
    const topics = pick(model.topics, 8, counter, (item) => {
      const topic = tidy(item.topic, 120);
      const why = tidy(item.why, 300);
      const sourceIds = [...new Set(item.sourceIds)];
      if (!topic || !why || sourceIds.length === 0 || sourceIds.length > 8 || !sourceIds.every((id) => anyId.has(id))) return null;
      return supported(topic, ctx.vocab) && supported(why, ctx.vocab) ? { topic, why, sourceIds } : null;
    });
    const questions = pick(model.questions, 15, counter, (item) => {
      const question = tidy(item.question, 400);
      if (!question || !supported(question, ctx.vocab)) return null;
      if (item.basisType === 'requirement') {
        return ctx.requirementIds.has(item.basisId) ? { question, basis: { type: 'requirement', requirementId: item.basisId } } : null;
      }
      return ctx.evidenceIds.has(item.basisId) ? { question, basis: { type: 'resume_evidence', evidenceId: item.basisId } } : null;
    });
    requireSome(questions.length, counter);
    return { output: { topics, questions }, dropped: counter.dropped };
  },
};

const sameText = (a, b) => a.replace(/^[\s•*\-–—]+/, '').replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/^[\s•*\-–—]+/, '').replace(/\s+/g, ' ').trim().toLowerCase();

const bulletSuggestions = {
  modelSchema: z.strictObject({
    items: z.array(z.strictObject({ evidenceId: str, suggestion: str, note: str })),
  }),

  /**
   * Candidates are bullets the analysis already cites as evidence and that the
   * engine found to have no measurable result (and that contain no figure at
   * all). This is the one task that needs resume wording, and it receives those
   * bullet lines only.
   */
  buildContext(result) {
    const { clean, stats } = createCleaner();
    const bullets = result.evidence
      .filter((e) => e.kind === 'bullet' && !e.strengthFactors.includes('quantified_outcome') && !/\d/.test(e.snippet))
      .map((e) => ({ evidenceId: e.id, text: clean(e.snippet), skillIds: e.skillIds }))
      .filter((b) => b.text !== WITHHELD)
      .slice(0, 8);
    if (bullets.length === 0) return { notApplicable: 'no_grounded_data' };

    const input = { bullets: bullets.map(({ evidenceId, text }) => ({ evidenceId, text })) };
    const byId = new Map(bullets.map((b) => [b.evidenceId, { text: b.text, vocab: buildVocabulary({ texts: [b.text], skillIds: b.skillIds }) }]));
    return { input, withheld: stats.withheld, byId };
  },

  ground(model, ctx) {
    const counter = { dropped: 0 };
    const seen = new Set();
    const items = pick(model.items, 10, counter, (item) => {
      const bullet = ctx.byId.get(item.evidenceId);
      if (!bullet || seen.has(item.evidenceId)) return null;
      const suggestion = tidy(item.suggestion, 320);
      const note = tidy(item.note, 240);
      if (!suggestion || !note || sameText(suggestion, bullet.text)) return null;
      // The suggestion must restate the bullet: nothing new may be claimed.
      if (!supported(suggestion, bullet.vocab, { restatementOf: bullet.text }) || !supported(note, bullet.vocab)) return null;
      seen.add(item.evidenceId);
      return { evidenceId: item.evidenceId, original: bullet.text, suggestion, note };
    });
    requireSome(items.length, counter);
    return { output: { items }, dropped: counter.dropped };
  },
};

// ── Registry ─────────────────────────────────────────────────────────────────

const SCHEMA_KEYWORDS_TO_DROP = new Set(['$schema', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'format', 'default']);

/** JSON Schema for native structured output: structure and types only, portable across providers. */
function toProviderSchema(schema) {
  const strip = (node, inProperties = false) => {
    if (Array.isArray(node)) return node.map((n) => strip(n));
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (!inProperties && SCHEMA_KEYWORDS_TO_DROP.has(key)) continue;
      out[!inProperties && key === 'oneOf' ? 'anyOf' : key] = strip(value, !inProperties && key === 'properties');
    }
    return out;
  };
  return strip(toJsonSchema(schema));
}

const DEFINITIONS = {
  resume_explanation: resumeExplanation,
  job_match_explanation: jobMatchExplanation,
  recommendation_wording: recommendationWording,
  interview_prep: interviewPrep,
  bullet_suggestions: bulletSuggestions,
};

const TASKS = Object.freeze(Object.fromEntries(Object.entries(DEFINITIONS).map(([id, definition]) => [id, Object.freeze({
  id,
  promptVersion: PROMPT_VERSION,
  system: systemPromptFor(id),
  jsonSchema: toProviderSchema(definition.modelSchema),
  ...definition,
})])));

module.exports = { TASKS, UngroundedOutputError, toProviderSchema };
