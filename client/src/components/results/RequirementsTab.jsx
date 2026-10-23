import React from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Quote, XCircle } from 'lucide-react';
import { label } from '../../lib/format';

/** Each job requirement with the engine's assessment and the resume evidence behind it. */
const RequirementsTab = ({ analysis }) => {
  const { jobMatch, evidence } = analysis.result;
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  const rows = jobMatch.requirements.map((requirement) => {
    const assessment = jobMatch.assessments.find((a) => a.requirementId === requirement.id);
    const evidenceId = assessment.best ? assessment.best.evidenceIds[0] : null;
    // Presentation only: the engine's wording for unscored items and exact matches is internal jargon.
    const reason = assessment.status === 'not_evaluated'
      ? 'This item is not scored in this analysis.'
      : assessment.statusReason.replace('Exact canonical skill match', 'Exact match');
    return { requirement, assessment, reason, snippet: evidenceId && evidenceById.get(evidenceId) ? evidenceById.get(evidenceId).snippet : null };
  });

  const withStatus = (status) => rows.filter((r) => r.assessment.status === status);
  const missing = withStatus('missing');
  // Unknown is not the same as missing: the resume simply does not say either way.
  const groups = [
    { title: 'Missing, required', short: 'Missing (required)', icon: XCircle, text: 'text-danger', fill: 'bg-danger', rows: missing.filter((r) => r.requirement.importance === 'required') },
    { title: 'Partially met', short: 'Partial', icon: AlertTriangle, text: 'text-warning', fill: 'bg-warning', rows: withStatus('partially_met') },
    { title: 'Matched', short: 'Matched', icon: CheckCircle2, text: 'text-success', fill: 'bg-success', rows: withStatus('met') },
    { title: 'Missing, not required', short: 'Missing (not required)', icon: XCircle, text: 'text-muted', fill: 'bg-line-strong', rows: missing.filter((r) => r.requirement.importance !== 'required') },
    { title: 'Not established or not scored', short: 'Unknown', icon: CircleDashed, text: 'text-muted', fill: 'bg-line', rows: [...withStatus('insufficient_evidence'), ...withStatus('not_evaluated')] },
  ].filter((group) => group.rows.length);

  if (!rows.length) return <p className="text-muted">No requirements could be identified in this job description.</p>;

  return (
    <div className="space-y-6">
      <section className="card p-5 sm:p-6">
        <h2 className="section-title">{rows.length} requirements found in the job description</h2>
        <p className="mt-1 text-sm text-muted">Each one shows how your resume was assessed and the resume text used as evidence.</p>
        <div className="mt-5 flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
          {groups.map((group) => <div key={group.title} className={`bar-fill rounded-none ${group.fill}`} style={{ width: `${(group.rows.length / rows.length) * 100}%` }} />)}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {groups.map((group) => (
            <li key={group.title} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${group.fill}`} />
              <span className="font-semibold">{group.rows.length}</span> <span className="text-muted">{group.short}</span>
            </li>
          ))}
        </ul>
      </section>

      {groups.map((group) => (
        <section key={group.title} className="card overflow-hidden">
          <h2 className="flex items-center gap-2.5 border-b bg-tint px-5 py-3.5 font-display font-bold">
            <group.icon className={`h-5 w-5 ${group.text}`} /> {group.title}
            <span className="badge badge-neutral ml-auto">{group.rows.length}</span>
          </h2>
          <ul className="divide-y">
            {group.rows.map(({ requirement, reason, snippet }) => (
              <li key={requirement.id} className="flex gap-3 px-5 py-4">
                <group.icon className={`mt-0.5 h-5 w-5 shrink-0 ${group.text}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold">
                    {requirement.displayName} <span className="badge badge-neutral ml-1 align-middle font-medium">{label(requirement.importance)}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted">{reason}</p>
                  {snippet && (
                    <blockquote className="quote mt-3">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent"><Quote className="h-3.5 w-3.5" /> From your resume</p>
                      “{snippet}”
                    </blockquote>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

export default RequirementsTab;
