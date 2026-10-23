import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase, Check, ChevronRight, FileText, Gauge, HeartPulse, Lightbulb, ScanSearch, Target, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { listAnalyses, deleteAnalysis } from '../lib/api';
import { analysisTitle, formatDate, verdict } from '../lib/format';
import Loading from '../components/Loading';
import ResumeVisual, { VisualLabel } from '../components/ResumeVisual';
import ScoreDisplay, { ScoreRing } from '../components/ScoreDisplay';

// Shown only when eligibility is not "clear".
const ELIGIBILITY = {
  review: { label: 'Eligibility needs review', badge: 'badge-warning' },
  likely_filtered: { label: 'Likely filtered', badge: 'badge-danger' },
};

const STEPS = [
  { icon: ScanSearch, title: 'Analyze', text: 'Upload your resume. Add a job description if you are applying for a specific role.' },
  { icon: Gauge, title: 'Understand', text: 'See your Resume Health score, where the points came from and what a parser can read.' },
  { icon: Lightbulb, title: 'Improve', text: 'Work through a prioritised list of specific changes, then analyze again.' },
];

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
};

/** The latest value of one score, linked to the report it came from. */
const LatestScore = ({ icon, tile, label, kind, score, analysis, children }) => (
  <Link to={`/results/${analysis.id}`} className="card card-hover group flex min-w-0 flex-col p-5 sm:p-6">
    <div className="flex items-center gap-3">
      <span className={`tile ${tile}`}>{React.createElement(icon, { className: 'h-5 w-5' })}</span>
      <h3 className="font-semibold">Latest {label}</h3>
    </div>
    <div className="mt-5 flex items-center gap-5">
      <ScoreRing label={label} score={score} />
      <div className="min-w-0">
        <p className="font-display text-xl font-bold">{verdict(score, kind)}</p>
        <p className="mt-1 truncate text-sm text-muted">{analysisTitle(analysis)}</p>
        <p className="text-sm text-muted">{formatDate(analysis.createdAt)}</p>
        {children}
      </div>
    </div>
    <p className="mt-auto flex items-center gap-1 pt-5 text-sm font-semibold text-primary">
      Open the report <ArrowRight className="nudge h-4 w-4" />
    </p>
  </Link>
);

const DashboardPage = () => {
  const { user } = useAuth();
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listAnalyses()
      .then(setAnalyses)
      .catch(() => setError('Your analyses could not be loaded. Please refresh the page to try again.'))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (analysis) => {
    if (!window.confirm(`Delete "${analysisTitle(analysis)}" from ${formatDate(analysis.createdAt)}? This cannot be undone.`)) return;
    try {
      await deleteAnalysis(analysis.id);
      setAnalyses((current) => current.filter((a) => a.id !== analysis.id));
      toast.success('Analysis deleted');
    } catch {
      toast.error('The analysis could not be deleted. Please try again.');
    }
  };

  // The list is newest first, so these are the user's most recent results.
  const latest = analyses[0];
  const latestJob = analyses.find((a) => a.summary.jobMatch);
  const todo = latest?.summary.recommendations;
  const firstName = user?.name.trim().split(/\s+/)[0];

  return (
    <div className="page space-y-10 sm:space-y-12">
      <section className="hero animate-rise px-6 py-10 sm:px-10 lg:px-14 lg:py-14">
        <div className="grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-sm font-semibold text-white/75">{greeting()}{firstName ? `, ${firstName}` : ''}</p>
            <h1 className="display mt-3">See how strong your resume really is.</h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-white/80">
              Get a clear health score and specific fixes in seconds. Applying for a particular role? Add the job description to see how well you match it.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/analyze" className="btn btn-lg btn-light group w-full sm:w-auto">
                Analyze your resume <ArrowRight className="nudge h-5 w-5" />
              </Link>
              <Link to="/analyze#job" className="btn btn-lg btn-outline-light w-full sm:w-auto">
                <Target className="h-5 w-5" /> Analyze for a job
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/75">
              {['PDF, DOCX or TXT', 'Job description optional', 'Same resume, same score'].map((point) => (
                <li key={point} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-success-bright" /> {point}</li>
              ))}
            </ul>
          </div>
          <div className="hidden py-6 md:block">
            <ResumeVisual
              top={latest
                ? <ScoreDisplay label="Resume Health" kind="health" score={latest.summary.resumeHealth.score} />
                : <VisualLabel icon={HeartPulse} tone="tile-success" title="Resume Health" text="How well it reads" />}
              bottom={latestJob
                ? <ScoreDisplay label="Job Match" kind="match" score={latestJob.summary.jobMatch.score} />
                : <VisualLabel icon={Target} tone="tile-accent" title="Job Match" text="Optional, per role" />}
            />
          </div>
        </div>
      </section>

      {loading ? (
        <Loading label="Loading your analyses…" />
      ) : error ? (
        <p role="alert" className="alert alert-danger">{error}</p>
      ) : !latest ? (
        <>
          <section className="animate-rise">
            <p className="eyebrow">How it works</p>
            <h2 className="page-title mt-2">Three steps to a stronger resume</h2>
            <ol className="mt-6 grid gap-4 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="card relative p-6">
                  <span className="absolute right-5 top-4 font-display text-4xl font-extrabold text-primary/10">{i + 1}</span>
                  <span className="tile tile-info"><step.icon className="h-5 w-5" /></span>
                  <h3 className="section-title mt-4">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.text}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="animate-rise rounded-3xl border-2 border-dashed border-primary/25 bg-linear-to-b from-surface to-primary-soft px-6 py-12 text-center">
            <span className="tile tile-brand mx-auto h-14 w-14 rounded-2xl"><FileText className="h-7 w-7" /></span>
            <h2 className="page-title mt-5">Your resume hasn&apos;t been analyzed yet</h2>
            <p className="mx-auto mt-2 max-w-md text-muted">
              Upload it to see its health score and a list of specific improvements. Every report is saved here so you can come back to it.
            </p>
            <Link to="/analyze" className="btn btn-lg btn-primary group mt-7">
              Analyze your resume <ArrowRight className="nudge h-5 w-5" />
            </Link>
          </section>
        </>
      ) : (
        <>
          <section className="animate-rise">
            <p className="eyebrow">Where you stand</p>
            <h2 className="page-title mt-2">Your latest results</h2>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <LatestScore icon={HeartPulse} tile="tile-success" label="Resume Health" kind="health" score={latest.summary.resumeHealth.score} analysis={latest} />

              {latestJob ? (
                <LatestScore icon={Target} tile="tile-accent" label="Job Match" kind="match" score={latestJob.summary.jobMatch.score} analysis={latestJob}>
                  {ELIGIBILITY[latestJob.summary.jobMatch.eligibility] && (
                    <span className={`badge mt-2 ${ELIGIBILITY[latestJob.summary.jobMatch.eligibility].badge}`}>{ELIGIBILITY[latestJob.summary.jobMatch.eligibility].label}</span>
                  )}
                </LatestScore>
              ) : (
                <div className="flex flex-col rounded-2xl border-2 border-dashed border-accent/30 bg-accent-soft/60 p-5 sm:p-6">
                  <span className="tile bg-surface text-accent shadow-card"><Target className="h-5 w-5" /></span>
                  <h3 className="section-title mt-4">Applying for a specific role?</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">Add the job description to see which of its requirements your resume meets, with the evidence for each.</p>
                  <Link to="/analyze#job" className="btn btn-secondary mt-auto self-start">Analyze for a job</Link>
                </div>
              )}

              <div className="hero flex flex-col rounded-2xl p-5 sm:p-6 md:col-span-2 lg:col-span-1">
                <div className="flex items-center gap-3">
                  <span className="tile bg-white/15"><Lightbulb className="h-5 w-5" /></span>
                  <h3 className="font-semibold">What to improve next</h3>
                </div>
                {todo.total > 0 ? (
                  <>
                    <p className="mt-5 font-display text-5xl font-extrabold leading-none">{todo.total}</p>
                    <p className="mt-2 text-sm text-white/80">suggested {todo.total === 1 ? 'change' : 'changes'} in your latest analysis</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                      {todo.critical > 0 && <span className="rounded-full bg-danger-bright/20 px-2.5 py-1 text-danger-bright">{todo.critical} critical</span>}
                      {todo.high > 0 && <span className="rounded-full bg-warning-bright/20 px-2.5 py-1 text-warning-bright">{todo.high} high priority</span>}
                    </div>
                  </>
                ) : (
                  <p className="mt-5 text-sm leading-relaxed text-white/80">Your latest analysis has no recommended changes. Analyze again after your next edit to keep it that way.</p>
                )}
                <Link to={`/results/${latest.id}?tab=improvements`} className="btn btn-light group mt-6 self-start">
                  See how to improve <ArrowRight className="nudge h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>

          <section className="animate-rise">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">History</p>
                <h2 className="page-title mt-2">Recent analyses <span className="align-middle text-base font-semibold text-muted">({analyses.length})</span></h2>
              </div>
              <Link to="/analyze" className="btn btn-secondary">New analysis</Link>
            </div>

            <ul className="mt-6 space-y-3">
              {analyses.map((analysis) => {
                const { resumeHealth, jobMatch } = analysis.summary;
                const eligibility = jobMatch && ELIGIBILITY[jobMatch.eligibility];
                return (
                  <li key={analysis.id} className="card card-hover group relative flex items-center gap-4 p-4 sm:px-5">
                    <span className={`tile hidden h-11 w-11 sm:grid ${jobMatch ? 'tile-accent' : 'tile-info'}`}>
                      {jobMatch ? <Briefcase className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
                      <div className="min-w-0">
                        {/* The link stretches over the whole row; the delete button sits above it. */}
                        <Link to={`/results/${analysis.id}`} className="block truncate font-semibold after:absolute after:inset-0 after:rounded-2xl group-hover:text-primary">
                          {analysisTitle(analysis)}
                        </Link>
                        <p className="truncate text-sm text-muted">{analysis.resume.fileName || 'Pasted resume'}</p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span className={`badge ${jobMatch ? 'badge-accent' : 'badge-info'}`}>{jobMatch ? 'Job analysis' : 'Resume analysis'}</span>
                          {formatDate(analysis.createdAt)}
                          {eligibility && <span className={`badge ${eligibility.badge}`}>{eligibility.label}</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2">
                        <ScoreDisplay label="Resume Health" kind="health" score={resumeHealth.score} />
                        {jobMatch && <ScoreDisplay label="Job Match" kind="match" score={jobMatch.score} />}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-1 sm:flex-row">
                      <button type="button" onClick={() => handleDelete(analysis)} aria-label={`Delete ${analysisTitle(analysis)}`} className="btn btn-ghost relative z-10 px-2.5 hover:bg-danger-soft hover:text-danger">
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <ChevronRight className="nudge hidden h-5 w-5 text-line-strong group-hover:text-primary sm:block" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
};

export default DashboardPage;
