/** Turns an API identifier such as "partially_met" into "Partially met". */
export const label = (id) => id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export const formatDate = (iso) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/** The display name of an analysis: its job when there is one. */
export const analysisTitle = (analysis) =>
  analysis.job ? [analysis.job.title, analysis.job.company].filter(Boolean).join(' at ') || 'Job match' : 'Resume check';

// The same thresholds everywhere a 0-100 value is coloured or described.
export const tone = (value) => (value === null || value === undefined ? 'none' : value >= 80 ? 'success' : value >= 60 ? 'warning' : 'danger');

const VERDICTS = {
  health: ['Healthy', 'Fair', 'Needs work'],
  match: ['Strong match', 'Moderate match', 'Weak match'],
  none: 'Not scored',
};

/** A short reading of a score. `kind` is "health" or "match". */
export const verdict = (score, kind) => ({ success: VERDICTS[kind][0], warning: VERDICTS[kind][1], danger: VERDICTS[kind][2], none: VERDICTS.none })[tone(score)];
