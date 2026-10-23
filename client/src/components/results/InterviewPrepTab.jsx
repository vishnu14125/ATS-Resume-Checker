import React, { useState } from 'react';
import { BookOpen, FileText, RefreshCw, Sparkles, Target } from 'lucide-react';
import toast from 'react-hot-toast';
import { runAiTask } from '../../lib/api';
import Loading from '../Loading';

const UNAVAILABLE = 'AI assistance is not available right now. Your analysis is unaffected.';

/**
 * Optional AI interview preparation, grounded in the analysis. Generated on
 * request and stored with the analysis; it never changes any score.
 */
const InterviewPrepTab = ({ analysis }) => {
  const stored = analysis.ai.results.find((r) => r.task === 'interview_prep' && r.status === 'completed');
  const [prep, setPrep] = useState(stored ? stored.output : null);
  const [loading, setLoading] = useState(false);
  const available = analysis.ai.status === 'available';
  const requirements = analysis.result.jobMatch.requirements;

  const generate = async (regenerate) => {
    setLoading(true);
    try {
      const result = await runAiTask(analysis.id, 'interview_prep', regenerate);
      if (result.status === 'completed') setPrep(result.output);
      else toast.error(result.status === 'unavailable' ? UNAVAILABLE : 'No interview material could be produced from this analysis. Please try again.');
    } catch {
      toast.error('The interview material could not be generated. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading label="Generating interview questions…" />;

  if (!prep) {
    return (
      <div className="card bg-linear-to-b from-surface to-accent-soft px-5 py-12 text-center sm:px-8">
        <span className="tile tile-brand mx-auto h-14 w-14 rounded-2xl"><Sparkles className="h-7 w-7" /></span>
        <h2 className="page-title mt-5">Prepare for the interview</h2>
        <p className="mx-auto mt-2 max-w-xl text-muted">
          Generate revision topics and interview questions for this role. They are written by AI from this job&apos;s requirements and your resume evidence only, and they do not affect any score.
        </p>
        {!available && <p className="alert alert-info mx-auto mt-5 max-w-xl text-left">{UNAVAILABLE}</p>}
        <button type="button" onClick={() => generate(false)} disabled={!available} className="btn btn-lg btn-primary mt-6">
          <Sparkles className="h-5 w-5" /> Generate questions
        </button>
      </div>
    );
  }

  const basis = (b) => b.type === 'requirement'
    ? { icon: Target, text: requirements.find((r) => r.id === b.requirementId)?.displayName || 'Job requirement' }
    : { icon: FileText, text: 'Your resume' };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/20 bg-accent-soft/60 p-4">
        <p className="flex max-w-xl items-start gap-2 text-sm text-muted">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> Written by AI from this analysis only. Each question is tied to a job requirement or to your resume.
        </p>
        <button type="button" onClick={() => generate(true)} disabled={!available} className="btn btn-secondary">
          <RefreshCw className="h-4 w-4" /> Regenerate
        </button>
      </div>

      {prep.topics.length > 0 && (
        <section>
          <h2 className="section-title">Topics to revise</h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {prep.topics.map((topic, i) => (
              <li key={i} className="card flex gap-3 p-4">
                <span className="tile tile-accent h-9 w-9"><BookOpen className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="font-semibold">{topic.topic}</p>
                  <p className="mt-1 text-sm text-muted">{topic.why}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="section-title">Questions ({prep.questions.length})</h2>
        <ol className="mt-4 space-y-3">
          {prep.questions.map((q, i) => {
            const { icon: Icon, text } = basis(q.basis);
            return (
              <li key={i} className="card flex gap-4 p-4 sm:p-5">
                <span className="tile tile-info font-display text-sm font-extrabold" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <p className="font-semibold leading-snug">{q.question}</p>
                  <p className="mt-2 flex items-start gap-1.5 text-sm text-muted">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" /> <span className="min-w-0 break-words">Based on: {text}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
};

export default InterviewPrepTab;
