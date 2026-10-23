import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, Briefcase, ClipboardList, Gauge, GraduationCap, HeartPulse, LayoutList, Lightbulb, ListChecks, ScanText, ShieldAlert, ShieldCheck, Sparkles, Star, Target, TrendingUp, Wrench } from 'lucide-react';
import { label, verdict } from '../../lib/format';
import { ScoreBar, ScoreRing } from '../ScoreDisplay';

const ELIGIBILITY = {
  clear: { title: 'No eligibility concerns', alert: 'alert-success', icon: ShieldCheck },
  review: { title: 'Eligibility needs review', alert: 'alert-warning', icon: ShieldAlert },
  likely_filtered: { title: 'Likely filtered by a hard requirement', alert: 'alert-danger', icon: ShieldAlert },
};

const COMPONENT_ICON = {
  parseability: ScanText, structure: LayoutList, technical_content: Wrench, impact: TrendingUp, completeness: ClipboardList,
  required_skills: Star, preferred_skills: Sparkles, experience: Briefcase, education: GraduationCap, certifications: Award, responsibilities: ListChecks,
};

const round1 = (n) => Math.round(n * 10) / 10;

/** Where a score's points came from: one row per evaluated component. */
const Breakdown = ({ title, breakdown }) => {
  const components = breakdown.components.filter((c) => c.status === 'evaluated');
  if (!components.length) return null;
  return (
    <div>
      <h3 className="section-title">{title}</h3>
      <ul className="mt-4 space-y-4">
        {components.map((component) => {
          const Icon = COMPONENT_ICON[component.id] || Gauge;
          return (
            <li key={component.id} className="flex items-center gap-3">
              <span className="tile tile-neutral h-9 w-9"><Icon className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex justify-between gap-3 text-sm">
                  <span className="font-semibold">{label(component.id)}</span>
                  <span className="whitespace-nowrap text-muted">
                    <span className="font-semibold text-ink">{round1(component.contribution)}</span> / {round1(component.maxContribution)}
                  </span>
                </div>
                <ScoreBar percent={component.rawScore * 100} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const ScoreOverview = ({ analysis }) => {
  const { resumeHealth, jobMatch, recommendations } = analysis.result;
  const eligibility = jobMatch ? ELIGIBILITY[jobMatch.eligibility.status] : null;
  const urgent = recommendations.filter((r) => r.priority === 'critical' || r.priority === 'high').length;

  const health = (
    <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
      <ScoreRing label="Resume Health" score={resumeHealth.score.score} size="lg" />
      <div>
        <p className="eyebrow flex items-center justify-center gap-1.5 text-success sm:justify-start"><HeartPulse className="h-4 w-4" /> Resume Health</p>
        <p className="mt-2 font-display text-3xl font-extrabold">{verdict(resumeHealth.score.score, 'health')}</p>
        <p className="mt-1 font-medium">Overall resume readiness</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {resumeHealth.score.scoreReason || 'How readable, complete and well evidenced your resume is on its own.'}
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {jobMatch ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="hero flex flex-col items-center gap-6 p-6 text-center sm:flex-row sm:p-8 sm:text-left">
              <ScoreRing label="Job Match" score={jobMatch.score.score} size="lg" onDark />
              <div>
                <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white/75 sm:justify-start"><Target className="h-4 w-4" /> Job Match</p>
                <p className="mt-2 font-display text-3xl font-extrabold">{verdict(jobMatch.score.score, 'match')}</p>
                <p className="mt-1 font-medium">Alignment with this role</p>
                <p className="mt-2 text-sm leading-relaxed text-white/80">
                  {jobMatch.score.scoreReason || 'How well the evidence in your resume meets the requirements in the job description.'}
                </p>
              </div>
            </section>
            <section className="card p-6 sm:p-8">{health}</section>
          </div>

          {/* Eligibility is a separate gate: it never changes the Job Match Score. */}
          <div className={`alert flex gap-3 ${eligibility.alert}`}>
            <eligibility.icon className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">{eligibility.title}</p>
              {jobMatch.eligibility.reasons.map((reason, i) => (
                <p key={i} className="mt-1">{reason}</p>
              ))}
              <p className="mt-1">Eligibility is reported separately and does not change the Job Match score.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="card p-6 sm:p-8"><Breakdown title="Where your Job Match points came from" breakdown={jobMatch.score} /></section>
            <section className="card p-6 sm:p-8"><Breakdown title="Where your Resume Health points came from" breakdown={resumeHealth.score} /></section>
          </div>
        </>
      ) : (
        <section className="card grid grid-cols-1 gap-8 p-6 sm:p-8 lg:grid-cols-2 lg:gap-12">
          <div className="flex items-center lg:border-r lg:pr-12">{health}</div>
          <Breakdown title="Where the points came from" breakdown={resumeHealth.score} />
        </section>
      )}

      <section className="flex flex-col gap-4 rounded-2xl border border-accent/20 bg-linear-to-r from-accent-soft to-primary-soft p-5 sm:flex-row sm:items-center sm:p-6">
        <span className="tile tile-brand h-11 w-11"><Lightbulb className="h-5 w-5" /></span>
        <div className="flex-1">
          <h3 className="section-title">
            {recommendations.length === 0 ? 'No changes recommended' : `${recommendations.length} suggested ${recommendations.length === 1 ? 'change' : 'changes'}`}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {recommendations.length === 0
              ? 'This resume has nothing to fix right now.'
              : urgent > 0 ? `${urgent} of them ${urgent === 1 ? 'is' : 'are'} high priority. Start there.` : 'None of them is urgent. Work through them when you next edit your resume.'}
            {!jobMatch && ' Applying for a specific role? Run a job match analysis to compare your resume with it.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!jobMatch && <Link to="/analyze#job" className="btn btn-secondary"><Target className="h-4 w-4" /> Analyze for a job</Link>}
          {recommendations.length > 0 && (
            <Link to="?tab=improvements" replace className="btn btn-primary group">See how to improve <ArrowRight className="nudge h-4 w-4" /></Link>
          )}
        </div>
      </section>
    </div>
  );
};

export default ScoreOverview;
