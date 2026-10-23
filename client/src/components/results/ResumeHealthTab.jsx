import React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { label } from '../../lib/format';

const CHECK = {
  pass: { text: 'Pass', badge: 'badge-success', icon: CheckCircle2, tone: 'text-success' },
  warn: { text: 'Warning', badge: 'badge-warning', icon: AlertTriangle, tone: 'text-warning' },
  fail: { text: 'Fail', badge: 'badge-danger', icon: XCircle, tone: 'text-danger' },
};
const SEVERITY = {
  high: { badge: 'badge-danger', strip: 'border-l-danger' },
  medium: { badge: 'badge-warning', strip: 'border-l-warning' },
  low: { badge: 'badge-neutral', strip: 'border-l-line-strong' },
};

/** The Resume Health report: readability checks and content findings. */
const ResumeHealthTab = ({ analysis }) => {
  const { resumeHealth } = analysis.result;
  const checks = resumeHealth.checks.filter((c) => c.result !== 'not_applicable');
  const count = (result) => checks.filter((c) => c.result === result).length;

  return (
    <div className="space-y-8">
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-tint px-5 py-4">
          <div>
            <h2 className="section-title">Readability checks</h2>
            <p className="mt-1 text-sm text-muted">Whether applicant tracking software can read your resume reliably. Overall readability: <span className="font-semibold text-ink">{label(resumeHealth.readability)}</span>.</p>
          </div>
          <p className="flex flex-wrap gap-2">
            {Object.keys(CHECK).filter(count).map((result) => (
              <span key={result} className={`badge ${CHECK[result].badge}`}>{count(result)} {CHECK[result].text.toLowerCase()}</span>
            ))}
          </p>
        </div>
        <ul className="divide-y">
          {checks.map((check) => {
            const { icon: Icon, tone, text } = CHECK[check.result];
            return (
              <li key={check.id} className="flex gap-3 px-5 py-4">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{label(check.checkId)} <span className="sr-only">: {text}</span></p>
                  <p className="mt-0.5 break-words text-sm text-muted">{check.evidence}</p>
                  {check.fix && (
                    <p className="mt-2 rounded-xl bg-primary-soft/70 px-3.5 py-2.5 text-sm">
                      <span className="font-semibold">What to do: </span>{check.fix}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="section-title">Content findings ({resumeHealth.findings.length})</h2>
        {resumeHealth.findings.length === 0 ? (
          <p className="alert alert-success mt-4 flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> No content issues were found.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {resumeHealth.findings.map((finding) => (
              <li key={finding.id} className={`card border-l-4 p-5 ${SEVERITY[finding.severity].strip}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${SEVERITY[finding.severity].badge}`}>{label(finding.severity)}</span>
                  <span className="badge badge-neutral">{label(finding.area)}</span>
                </div>
                <p className="mt-3 font-semibold leading-snug">{finding.message}</p>
                <p className="mt-2 text-sm text-muted"><span className="font-semibold text-ink">What to do: </span>{finding.suggestion}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {resumeHealth.limitations.length > 0 && (
        <section className="flex gap-3 rounded-2xl border bg-tint p-5 text-sm text-muted">
          <Info className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h2 className="font-semibold text-ink">Limits of this report</h2>
            {resumeHealth.limitations.map((limitation, i) => <p key={i} className="mt-1">{limitation}</p>)}
          </div>
        </section>
      )}
    </div>
  );
};

export default ResumeHealthTab;
