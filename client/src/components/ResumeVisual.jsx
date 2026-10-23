import React from 'react';
import { Check } from 'lucide-react';

const SECTIONS = [['w-full', 'w-10/12', 'w-11/12'], ['w-11/12', 'w-9/12'], ['w-10/12', 'w-full']];

/**
 * The product illustration: a resume being checked line by line. Purely
 * decorative; `top` and `bottom` are the two floating cards, which the caller
 * fills with real scores when it has them.
 */
const ResumeVisual = ({ top, bottom }) => (
  <div className="relative mx-auto w-60 sm:w-64" aria-hidden="true">
    <div className="absolute inset-0 translate-x-5 translate-y-3 rotate-6 rounded-2xl bg-white/10 ring-1 ring-white/20" />
    <div className="relative -rotate-2 rounded-2xl bg-white p-5 shadow-lift">
      <div className="flex items-center gap-3">
        <span className="h-9 w-9 rounded-full bg-linear-to-br from-primary to-accent" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 w-7/12 rounded-full bg-ink/80" />
          <div className="h-2 w-5/12 rounded-full bg-line" />
        </div>
      </div>
      {SECTIONS.map((lines, i) => (
        <div key={i} className="mt-4 space-y-2">
          <div className="h-2 w-4/12 rounded-full bg-accent/60" />
          {lines.map((width, j) => (
            <div key={j} className="flex items-center gap-2">
              <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
              <div className={`h-2 rounded-full bg-line ${width}`} />
            </div>
          ))}
        </div>
      ))}
    </div>
    <div className="absolute -right-6 -top-5 rounded-2xl bg-white p-2.5 pr-4 text-ink shadow-lift sm:-right-12">{top}</div>
    <div className="absolute -bottom-5 -left-6 rounded-2xl bg-white p-2.5 pr-4 text-ink shadow-lift sm:-left-12">{bottom}</div>
  </div>
);

/** A floating card that names a score without showing a number. */
export const VisualLabel = ({ icon, tone, title, text }) => (
  <div className="flex items-center gap-2.5">
    <span className={`tile ${tone}`}>{React.createElement(icon, { className: 'h-5 w-5' })}</span>
    <div className="leading-tight">
      <p className="text-xs font-semibold">{title}</p>
      <p className="text-xs text-muted">{text}</p>
    </div>
  </div>
);

export default ResumeVisual;
