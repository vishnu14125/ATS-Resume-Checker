import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Check, HeartPulse, Lightbulb, Target } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ResumeVisual, { VisualLabel } from '../components/ResumeVisual';

const POINTS = [
  {
    icon: HeartPulse,
    tile: 'tile-success',
    title: 'Resume Health',
    text: 'A score for how reliably your resume can be read and how well its content is evidenced, with a breakdown of where the points came from.',
  },
  {
    icon: Target,
    tile: 'tile-accent',
    title: 'Job Match',
    badge: 'Optional',
    text: 'Paste a job description to see each requirement marked as matched, partial or missing, with the resume text that supports it.',
  },
  {
    icon: Lightbulb,
    tile: 'tile-warning',
    title: 'How to improve',
    text: 'A prioritised list of specific changes. With a job description you can also generate interview questions for that role.',
  },
];

const HomePage = () => {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <div className="page space-y-12">
      <section className="hero animate-rise px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
        <div className="grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/85">Resume analysis, explained</p>
            <h1 className="display mt-5">Check your resume before you apply.</h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-white/80">
              Upload your resume to see how well it reads and what to fix. Add a job description if you have one to see how closely you match that role.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/signup" className="btn btn-lg btn-light group w-full sm:w-auto">
                Analyze my resume <ArrowRight className="nudge h-5 w-5" />
              </Link>
              <Link to="/login" className="btn btn-lg btn-outline-light w-full sm:w-auto">Log in</Link>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/75">
              {['PDF, DOCX or TXT', 'Job description optional', 'Same resume, same score'].map((point) => (
                <li key={point} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-success-bright" /> {point}</li>
              ))}
            </ul>
          </div>
          <div className="hidden py-6 md:block">
            <ResumeVisual
              top={<VisualLabel icon={HeartPulse} tone="tile-success" title="Resume Health" text="How well it reads" />}
              bottom={<VisualLabel icon={Target} tone="tile-accent" title="Job Match" text="Optional, per role" />}
            />
          </div>
        </div>
      </section>

      <section className="animate-rise">
        <p className="eyebrow">What you get</p>
        <h2 className="page-title mt-2">A report you can act on</h2>
        <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {POINTS.map((point) => (
            <li key={point.title} className="card card-hover p-6">
              <span className={`tile ${point.tile}`}><point.icon className="h-5 w-5" /></span>
              <h3 className="section-title mt-4 flex items-center gap-2">
                {point.title} {point.badge && <span className="badge badge-neutral font-sans">{point.badge}</span>}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{point.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted">Scores come from fixed rules, so the same resume always gets the same result.</p>
      </section>
    </div>
  );
};

export default HomePage;
