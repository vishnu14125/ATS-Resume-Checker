import React from 'react';
import { CheckCircle2, Lightbulb, ShieldAlert } from 'lucide-react';
import { label } from '../../lib/format';

const PRIORITY = {
  critical: { badge: 'badge-danger', strip: 'border-l-danger' },
  high: { badge: 'badge-warning', strip: 'border-l-warning' },
  medium: { badge: 'badge-info', strip: 'border-l-primary' },
  low: { badge: 'badge-neutral', strip: 'border-l-line-strong' },
};

/** Eligibility concerns and the engine's recommendations, in the order the engine ranked them. */
const ImprovementTab = ({ analysis }) => {
  const { jobMatch, recommendations } = analysis.result;
  // A "passed" finding is not a concern, and "unknown" means the resume does not say.
  const concerns = jobMatch ? jobMatch.eligibility.findings.filter((f) => f.outcome !== 'passed') : [];
  const requirementName = (id) => jobMatch.requirements.find((r) => r.id === id)?.displayName || label(id);

  return (
    <div className="space-y-8">
      {concerns.length > 0 && (
        <section>
          <h2 className="section-title">Eligibility concerns ({concerns.length})</h2>
          <p className="mt-1 text-sm text-muted">Hard requirements in the job description that your resume may not meet.</p>
          <ul className="mt-4 space-y-3">
            {concerns.map((finding) => (
              <li key={finding.id} className={`alert flex gap-3 ${finding.outcome === 'failed' ? 'alert-danger' : 'alert-warning'}`}>
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <p className="min-w-0 break-words font-semibold">{requirementName(finding.requirementId)}</p>
                    <span className="badge bg-surface">{label(finding.outcome)}</span>
                  </div>
                  <p className="mt-1 text-ink">{finding.explanation}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="section-title">How to improve ({recommendations.length})</h2>
        <p className="mt-1 text-sm text-muted">Specific changes, most important first.</p>
        {recommendations.length === 0 ? (
          <p className="alert alert-success mt-4 flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> No changes are recommended for this resume.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {recommendations.map((rec) => (
              <li key={rec.id} className={`card border-l-4 p-5 sm:p-6 ${PRIORITY[rec.priority].strip}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge uppercase tracking-wide ${PRIORITY[rec.priority].badge}`}>{label(rec.priority)} priority</span>
                  <span className="badge badge-neutral">{label(rec.category)}</span>
                </div>
                <h3 className="mt-3 font-semibold leading-snug">{rec.issue}</h3>
                <div className="mt-4 flex gap-3 rounded-xl bg-primary-soft/70 p-4 text-sm">
                  <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <p><span className="font-semibold">What to do: </span>{rec.action}</p>
                </div>
                <p className="mt-4 text-sm text-muted"><span className="font-semibold text-ink">Why this matters: </span>{rec.rationale}</p>
                {rec.integrityNote && (
                  <p className="mt-2 flex items-start gap-2 text-sm font-medium text-warning"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {rec.integrityNote}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default ImprovementTab;
