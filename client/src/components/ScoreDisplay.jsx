import React from 'react';
import { tone, verdict } from '../lib/format';

const TEXT = { success: 'text-success', warning: 'text-warning', danger: 'text-danger', none: 'text-muted' };
const FILL = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', none: 'bg-line-strong' };
const STROKE = { success: 'stroke-success', warning: 'stroke-warning', danger: 'stroke-danger' };
const STROKE_ON_DARK = { success: 'stroke-success-bright', warning: 'stroke-warning-bright', danger: 'stroke-danger-bright' };

const SIZES = {
  sm: { box: 'h-12 w-12', number: 'text-sm font-bold', stroke: 10 },
  md: { box: 'h-24 w-24', number: 'text-3xl font-extrabold', stroke: 9 },
  lg: { box: 'h-36 w-36 sm:h-40 sm:w-40', number: 'text-5xl font-extrabold', stroke: 8 },
};
const RADIUS = 42;
const LENGTH = 2 * Math.PI * RADIUS;

/** A score out of 100 drawn as a ring that fills on display. Scores are shown as whole numbers. */
export const ScoreRing = ({ label, score, size = 'md', onDark = false }) => {
  const scored = score !== null && score !== undefined;
  const { box, number, stroke } = SIZES[size];
  return (
    <div className={`relative shrink-0 ${box}`} role="img" aria-label={`${label}: ${scored ? `${Math.round(score)} out of 100` : 'not scored'}`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth={stroke} className={onDark ? 'stroke-white/15' : 'stroke-line'} />
        {scored && (
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={LENGTH}
            style={{ '--ring-full': LENGTH, '--ring-offset': LENGTH * (1 - Math.max(0, Math.min(100, score)) / 100) }}
            className={`ring-progress ${(onDark ? STROKE_ON_DARK : STROKE)[tone(score)]}`}
          />
        )}
      </svg>
      <span className={`absolute inset-0 grid place-items-center font-display leading-none ${number} ${onDark ? 'text-white' : scored ? 'text-ink' : 'text-muted'}`}>
        {scored ? Math.round(score) : '—'}
      </span>
    </div>
  );
};

/** A thin bar for a 0-100 value. Always shown beside the number it represents. */
export const ScoreBar = ({ percent }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
    <div className={`bar-fill ${FILL[tone(percent)]}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
  </div>
);

/** The one-line form used in lists: a small ring with the score's name and reading. */
const ScoreDisplay = ({ label, score, kind }) => (
  <div className="flex items-center gap-2.5">
    <ScoreRing label={label} score={score} size="sm" />
    <div className="leading-tight">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`text-sm font-semibold ${TEXT[tone(score)]}`}>{verdict(score, kind)}</p>
    </div>
  </div>
);

export default ScoreDisplay;
