import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { ArrowRight, Check, CheckCircle2, FileText, HeartPulse, Target, UploadCloud, X } from 'lucide-react';
import { createAnalysis, errorMessage } from '../lib/api';

const RESUME_MAX_CHARS = 100000;
const JOB_MAX_CHARS = 30000;

const REJECTIONS = {
  'file-too-large': 'That file is larger than 10 MB.',
  'file-invalid-type': 'Only PDF, DOCX and TXT files are supported.',
  'too-many-files': 'Please upload one file at a time.',
};

// The two kinds of analysis. Which one runs depends only on whether a job description is given.
const MODES = [
  { job: false, icon: HeartPulse, title: 'Resume analysis', text: 'Understand the quality and readiness of your resume.', gets: ['Resume Health score', 'Readability checks', 'Prioritised improvements'] },
  { job: true, icon: Target, title: 'Job match analysis', text: 'Compare your resume with a specific job description.', gets: ['Everything in a resume analysis', 'Job Match score', 'Requirement-by-requirement evidence', 'Interview preparation'] },
];

const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** The numbered heading of one step; the number becomes a tick once the step is filled in. */
const StepHeading = ({ number, done, title, badge, badgeTone, children }) => (
  <div className="flex items-start gap-4">
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-sm font-extrabold transition-colors ${done ? 'bg-success text-white' : 'bg-primary-soft text-primary'}`}>
      {done ? <Check className="h-4 w-4" strokeWidth={3} /> : number}
    </span>
    <div className="min-w-0">
      <h2 className="section-title flex flex-wrap items-center gap-2">
        {title} <span className={`badge ${badgeTone}`}>{badge}</span>
      </h2>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  </div>
);

const AnalysisPage = () => {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const jobField = useRef(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const hasResume = Boolean(uploadedFile) || Boolean(resumeText.trim());
  const hasJob = Boolean(jobDescription.trim());

  // "Analyze for a job" links here with #job, which starts the user in the job description.
  useEffect(() => {
    if (hash === '#job') jobField.current?.focus();
  }, [hash]);

  // The file is sent with the analysis request; the server reads it there.
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDropAccepted: ([file]) => {
      setUploadedFile(file);
      setResumeText('');
      setFileError('');
    },
    onDropRejected: ([rejection]) => setFileError(REJECTIONS[rejection.errors[0]?.code] || 'That file could not be used.'),
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    multiple: false,
    maxSize: 10 * 1024 * 1024,
    disabled: isAnalyzing,
  });

  const handleAnalysis = async () => {
    if (isAnalyzing || !hasResume) return;
    setError('');
    setIsAnalyzing(true);
    try {
      const analysis = await createAnalysis({ resumeFile: uploadedFile, resumeText, jobText: jobDescription });
      navigate(`/results/${analysis.id}`);
    } catch (err) {
      setError(errorMessage(err, 'The analysis could not be completed. Please check your connection and try again.'));
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="page animate-rise">
      <p className="eyebrow">New analysis</p>
      <h1 className="page-title mt-2">Analyze your resume</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Your resume is all you need. Add a job description only if you want to see how well you match a specific role.
      </p>

      <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="card p-5 sm:p-7">
            <StepHeading number={1} done={hasResume} title="Add your resume" badge="Required" badgeTone="badge-info">
              Upload a file, or paste the text if you do not have one to hand.
            </StepHeading>

            {uploadedFile ? (
              <div className="mt-5 flex animate-rise items-center gap-4 rounded-2xl border border-success/30 bg-linear-to-r from-success-soft to-surface p-4">
                <span className="tile tile-brand h-12 w-12"><FileText className="h-6 w-6" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{uploadedFile.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                    <span className="badge badge-neutral">{uploadedFile.name.split('.').pop().toUpperCase()}</span>
                    {formatSize(uploadedFile.size)}
                    <span className="flex items-center gap-1 font-medium text-success"><CheckCircle2 className="h-4 w-4" /> Ready to analyze</span>
                  </p>
                </div>
                <button type="button" onClick={() => setUploadedFile(null)} disabled={isAnalyzing} aria-label="Remove file" className="btn btn-secondary px-3">
                  <X className="h-4 w-4" /> <span className="hidden sm:inline">Remove</span>
                </button>
              </div>
            ) : (
              <>
                <div
                  {...getRootProps({ role: 'button', 'aria-label': 'Choose a resume file' })}
                  className={`group mt-5 cursor-pointer rounded-2xl border-2 border-dashed px-4 py-10 text-center transition duration-200 ${
                    isDragActive ? 'scale-[1.01] border-primary bg-primary-soft' : 'border-primary/30 bg-linear-to-b from-tint to-primary-soft/60 hover:border-primary hover:bg-primary-soft'
                  }`}
                >
                  <input {...getInputProps()} aria-label="Resume file" />
                  <span className={`tile tile-brand mx-auto h-14 w-14 rounded-2xl transition-transform duration-200 group-hover:-translate-y-1 ${isDragActive ? '-translate-y-1' : ''}`}>
                    <UploadCloud className="h-7 w-7" />
                  </span>
                  <p className="mt-4 font-display text-lg font-bold">{isDragActive ? 'Drop your resume here' : 'Drag your resume here'}</p>
                  <p className="mt-1 text-sm text-muted">or <span className="font-semibold text-primary">browse your files</span></p>
                  <p className="mt-4 flex justify-center gap-2">
                    {['PDF', 'DOCX', 'TXT'].map((type) => <span key={type} className="badge border border-line bg-surface text-muted">{type}</span>)}
                    <span className="badge text-muted">up to 10 MB</span>
                  </p>
                </div>
                {fileError && <p role="alert" className="alert alert-danger mt-3">{fileError}</p>}

                <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-muted">
                  <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
                </div>

                <label htmlFor="resume-text" className="label">Paste the resume text</label>
                <textarea
                  id="resume-text"
                  rows={5}
                  maxLength={RESUME_MAX_CHARS}
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  disabled={isAnalyzing}
                  className="input"
                />
                <p className="mt-1 text-right text-xs text-muted">{resumeText.length.toLocaleString()} / {RESUME_MAX_CHARS.toLocaleString()}</p>
              </>
            )}
          </section>

          <section id="job" className="card scroll-mt-24 p-5 sm:p-7">
            <StepHeading number={2} done={hasJob} title="Add a job description" badge="Optional" badgeTone="badge-neutral">
              <label htmlFor="job-text">Skip this to check the resume on its own. Paste a job description to also see which of its requirements your resume meets.</label>
            </StepHeading>
            <textarea
              id="job-text"
              ref={jobField}
              rows={8}
              maxLength={JOB_MAX_CHARS}
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              disabled={isAnalyzing}
              placeholder="Paste the full job posting here…"
              className="input mt-5"
            />
            <p className="mt-1 text-right text-xs text-muted">{jobDescription.length.toLocaleString()} / {JOB_MAX_CHARS.toLocaleString()}</p>
          </section>
        </div>

        <aside className="card overflow-hidden lg:sticky lg:top-24">
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft font-display text-sm font-extrabold text-primary">3</span>
              <h2 className="section-title">Run the analysis</h2>
            </div>

            <div className="mt-5 space-y-3">
              {MODES.map((mode) => {
                const selected = mode.job === hasJob;
                return (
                  <div key={mode.title} aria-current={selected || undefined} className={`rounded-xl border p-4 transition duration-200 ${selected ? 'border-primary bg-primary-soft shadow-card' : 'border-line'}`}>
                    <p className="flex items-center gap-2 font-semibold">
                      <mode.icon className={`h-4 w-4 ${selected ? 'text-primary' : 'text-muted'}`} /> {mode.title}
                      {selected && <span className="badge ml-auto bg-primary text-white">Selected</span>}
                    </p>
                    <p className="mt-1 text-sm text-muted">{mode.text}</p>
                    {selected && (
                      <ul className="mt-3 space-y-1.5 text-sm">
                        {mode.gets.map((item) => (
                          <li key={item} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted">The kind of analysis follows from step 2: it is a job match analysis when a job description is present.</p>
          </div>

          <div className="border-t bg-tint p-5 sm:p-6">
            {error && <p role="alert" className="alert alert-danger mb-4">{error}</p>}
            <button type="button" onClick={handleAnalysis} disabled={isAnalyzing || !hasResume} className="btn btn-lg btn-primary group w-full">
              {isAnalyzing ? <span className="spinner" /> : null}
              {isAnalyzing ? 'Analyzing…' : hasJob ? 'Analyze resume and job match' : 'Analyze my resume'}
              {!isAnalyzing && <ArrowRight className="nudge h-5 w-5" />}
            </button>
            {isAnalyzing && (
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <div className="h-full w-2/5 animate-slide rounded-full bg-linear-to-r from-primary to-accent" />
              </div>
            )}
            <p role="status" className="mt-3 text-center text-sm text-muted">
              {isAnalyzing ? 'Reading and scoring your resume. This usually takes a few seconds.' : !hasResume ? 'Add a resume to continue.' : 'Your report opens as soon as it is ready.'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default AnalysisPage;
