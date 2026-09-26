import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileText, RefreshCw, Layers, CheckCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const ProjectAnalysisTab = ({ resumeId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchProjects = async (generate = false) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const method = generate ? 'post' : 'get';
      const res = await axios[method](`/api/career/${resumeId}/project-relevance`, 
        generate ? {} : undefined,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.data) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error(err);
      if (generate) toast.error("Failed to analyze projects. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects(false);
  }, [resumeId]);

  if (loading && !data) {
    return (
      <div className="surface-card p-16 text-center">
        <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-ink-600 font-medium text-lg">Extracting and analyzing project relevance...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="surface-card p-12 text-center">
        <div className="w-16 h-16 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Layers className="w-8 h-8" />
        </div>
        <h3 className="heading-3 mb-2">Project Relevance Analysis</h3>
        <p className="body-base max-w-md mx-auto mb-8">Analyze how your portfolio projects map to the job requirements and discover how to position them in interviews.</p>
        <button onClick={() => fetchProjects(true)} className="btn-primary px-8">
          <RefreshCw className="w-4 h-4 mr-2" /> Analyze Projects
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="surface-card p-8 bg-gradient-to-br from-white to-ink-50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="heading-2 mb-2 text-ink-950 flex items-center">
              <Layers className="w-6 h-6 mr-3 text-brand-500" />
              Project Relevance
            </h2>
            <p className="body-base">How your portfolio and professional projects align with the target role.</p>
          </div>
          <button onClick={() => fetchProjects(true)} className="btn-secondary whitespace-nowrap">
            <RefreshCw className="w-4 h-4 mr-2" /> Re-analyze
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data.projects.map((proj, idx) => (
          <div key={idx} className="surface-card flex flex-col h-full border-t-4 border-t-brand-500 overflow-hidden">
            <div className="p-6 border-b border-ink-100 bg-white">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-ink-950 text-lg">{proj.projectName}</h3>
                <span className={`text-xs font-bold px-2 py-1 rounded uppercase tracking-wider ${
                  proj.relevanceScore >= 80 ? 'bg-emerald-100 text-emerald-800' :
                  proj.relevanceScore >= 50 ? 'bg-amber-100 text-amber-800' :
                  'bg-ink-100 text-ink-600'
                }`}>
                  {proj.relevanceScore}/100 Relevance
                </span>
              </div>
            </div>
            
            <div className="p-6 flex-1 flex flex-col space-y-5 bg-ink-50/30">
              <div>
                <p className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2 flex items-center">
                  <CheckCircle className="w-3 h-3 mr-1 text-emerald-500" /> Applicable Skills
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {proj.applicableSkills.map((skill, sIdx) => (
                    <span key={sIdx} className="px-2 py-1 bg-white border border-ink-200 text-ink-700 rounded text-xs font-medium shadow-sm">
                      {skill}
                    </span>
                  ))}
                  {!proj.applicableSkills.length && <span className="text-sm text-ink-400">None detected</span>}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2 flex items-center">
                  <AlertCircle className="w-3 h-3 mr-1 text-brand-500" /> Missing Job Context
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {proj.missingContext.map((ctx, cIdx) => (
                    <span key={cIdx} className="px-2 py-1 bg-rose-50 border border-rose-100 text-rose-700 rounded text-xs font-medium">
                      {ctx}
                    </span>
                  ))}
                  {!proj.missingContext.length && <span className="text-sm text-ink-400">Fully contextualized</span>}
                </div>
              </div>

              <div className="mt-auto pt-4">
                <p className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Improvement Suggestion</p>
                <p className="text-sm text-ink-700 leading-relaxed bg-white p-3 rounded-lg border border-ink-100 shadow-sm">{proj.suggestion}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {data.projects.length === 0 && (
        <div className="surface-card p-8 text-center text-ink-500">
          No projects were detected in your resume to analyze.
        </div>
      )}
    </div>
  );
};

export default ProjectAnalysisTab;
