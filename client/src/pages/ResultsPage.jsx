import React, { useState, useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Briefcase, CalendarDays, FileText, HeartPulse, Lightbulb, ListChecks, MessagesSquare, PieChart, Plus } from 'lucide-react';

import { getAnalysis } from '../lib/api';
import { analysisTitle, formatDate } from '../lib/format';
import Loading from '../components/Loading';
import ScoreOverview from '../components/results/ScoreOverview';
import RequirementsTab from '../components/results/RequirementsTab';
import ImprovementTab from '../components/results/ImprovementTab';
import ResumeHealthTab from '../components/results/ResumeHealthTab';
import InterviewPrepTab from '../components/results/InterviewPrepTab';

const ResultsPage = () => {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAnalysis(id)
      .then(setAnalysis)
      .catch(() => setAnalysis(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Loading label="Loading analysis…" />;

  if (!analysis) {
    return (
      <div className="page">
        <p role="alert" className="alert alert-danger">
          This analysis could not be loaded. It may have been deleted, or it may belong to another account.
        </p>
        <Link to="/dashboard" className="btn btn-secondary mt-4">Back to the dashboard</Link>
      </div>
    );
  }

  // A resume-only analysis has no job requirements, so the job sections are not offered.
  const hasJob = analysis.mode === 'job_match';
  const tabs = [
    { id: 'overview', label: 'Overview', icon: PieChart, Panel: ScoreOverview },
    hasJob && { id: 'requirements', label: 'Requirements', icon: ListChecks, count: analysis.result.jobMatch.requirements.length, Panel: RequirementsTab },
    { id: 'improvements', label: 'How to improve', icon: Lightbulb, count: analysis.result.recommendations.length, Panel: ImprovementTab },
    { id: 'health', label: 'Resume Health', icon: HeartPulse, Panel: ResumeHealthTab },
    hasJob && { id: 'interview', label: 'Interview prep', icon: MessagesSquare, Panel: InterviewPrepTab },
  ].filter(Boolean);
  // The open tab lives in the URL so a refresh or a shared link keeps it.
  const active = tabs.find((tab) => tab.id === params.get('tab')) || tabs[0];

  return (
    <div className="page animate-rise">
      <Link to="/dashboard" className="link inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span className="tile tile-brand hidden h-12 w-12 sm:grid">{hasJob ? <Briefcase className="h-6 w-6" /> : <FileText className="h-6 w-6" />}</span>
          <div className="min-w-0">
            <p className="eyebrow">{hasJob ? 'Job match analysis' : 'Resume analysis'}</p>
            <h1 className="page-title mt-1 break-words">{analysisTitle(analysis)}</h1>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              <span className="flex min-w-0 items-center gap-1.5"><FileText className="h-4 w-4 shrink-0" /> <span className="break-all">{analysis.resume.fileName || 'Pasted resume'}</span></span>
              <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {formatDate(analysis.createdAt)}</span>
            </p>
          </div>
        </div>
        <Link to="/analyze" className="btn btn-secondary"><Plus className="h-4 w-4" /> New analysis</Link>
      </header>

      <div role="tablist" aria-label="Analysis sections" className="card mt-7 flex gap-1 overflow-x-auto p-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={tab === active}
            aria-controls={`panel-${tab.id}`}
            // On narrow screens the tab row scrolls; keep the open tab in view.
            ref={tab === active ? (el) => { el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } : undefined}
            onClick={() => setParams({ tab: tab.id }, { replace: true })}
            className={`flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition duration-200 focus-visible:-outline-offset-2 ${
              tab === active ? 'bg-linear-to-r from-primary to-accent text-white shadow-cta' : 'text-muted hover:bg-primary-soft hover:text-primary'
            }`}
          >
            <tab.icon className="h-4 w-4" /> {tab.label}
            {tab.count !== undefined && <span className={`rounded-full px-1.5 text-xs ${tab === active ? 'bg-white/20' : 'bg-page'}`}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Every panel stays mounted so that work done in one (generated interview questions) survives a tab switch. */}
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} hidden={tab !== active} className="mt-6 animate-rise">
          <tab.Panel analysis={analysis} />
        </div>
      ))}
    </div>
  );
};

export default ResultsPage;
