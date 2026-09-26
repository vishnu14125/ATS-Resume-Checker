import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart3, 
  Target, 
  AlertCircle, 
  Star, 
  Lightbulb, 
  TrendingUp, 
  FileText,
  CheckCircle,
  Menu,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';

import ResultsHeader from '../components/results/ResultsHeader';
import ScoreOverview from '../components/results/ScoreOverview';
import InterviewPrepTab from '../components/results/InterviewPrepTab';
import LearningRoadmapTab from '../components/results/LearningRoadmapTab';
import ProjectAnalysisTab from '../components/results/ProjectAnalysisTab';

const ResultsPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [results, setResults] = useState(null);
  const [activeSection, setActiveSection] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`/api/resumes/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data.success) {
          setResults({
            ...response.data.data.analysis,
            originalText: response.data.data.originalText
          });
          localStorage.setItem('resumeId', response.data.data.id);
        }
      } catch (err) {
        console.error('Failed to fetch results:', err);
        setError('Failed to load analysis results. You may not have permission to view this.');
        toast.error('Failed to load intelligence');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchResults();
    } else {
      navigate('/analyze');
    }
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto"></div>
          <p className="mt-4 text-ink-600 font-medium">Processing Intelligence...</p>
        </div>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="min-h-screen bg-surface-bg flex items-center justify-center p-4">
        <div className="text-center max-w-md surface-card p-8">
          <AlertCircle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
          <h2 className="heading-3 mb-2">Analysis Not Found</h2>
          <p className="text-ink-600 mb-6">{error || 'We could not find the requested intelligence report.'}</p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const sections = [
    { id: 'overview', label: 'Match Overview', icon: BarChart3 },
    { id: 'skills', label: 'Skill Intelligence', icon: Target },
    { id: 'issues', label: 'Quality Audit', icon: AlertCircle },
    { id: 'optimizer', label: 'AI Optimizer', icon: Star },
    { id: 'interview', label: 'Interview Prep', icon: Lightbulb },
    { id: 'roadmap', label: 'Learning Roadmap', icon: TrendingUp },
    { id: 'projects', label: 'Project Relevance', icon: FileText }
  ];

  return (
    <div className="min-h-screen bg-surface-bg pt-8 pb-20">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top Header */}
        <ResultsHeader navigate={navigate} resumeId={id} />

        <div className="flex flex-col lg:flex-row gap-8 mt-6">
          
          {/* Sidebar Navigation */}
          <div className="hidden lg:block w-72 shrink-0">
            <div className="sticky top-8 space-y-1">
              <h3 className="text-xs font-bold text-ink-400 uppercase tracking-wider mb-4 px-3">Intelligence Report</h3>
              {sections.map((sec) => {
                const Icon = sec.icon;
                const isActive = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    onClick={() => setActiveSection(sec.id)}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all font-semibold text-sm ${
                      isActive 
                        ? 'bg-brand-50 text-brand-700 shadow-sm border border-brand-100' 
                        : 'text-ink-600 hover:bg-white hover:text-ink-900 border border-transparent'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-brand-600' : 'text-ink-400'}`} />
                    <span>{sec.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Mobile Navigation Dropdown */}
          <div className="lg:hidden mb-4">
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-full flex justify-between items-center bg-white border border-ink-200 p-4 rounded-xl shadow-sm"
            >
              <div className="flex items-center space-x-2 font-bold text-ink-900">
                <Menu className="w-5 h-5 text-ink-500" />
                <span>{sections.find(s => s.id === activeSection)?.label}</span>
              </div>
              <span className="text-ink-400 text-sm">Change Section</span>
            </button>
            
            <AnimatePresence>
              {mobileMenuOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-2 surface-card p-2 space-y-1 z-50 relative"
                >
                  {sections.map((sec) => {
                    const Icon = sec.icon;
                    const isActive = activeSection === sec.id;
                    return (
                      <button
                        key={sec.id}
                        onClick={() => { setActiveSection(sec.id); setMobileMenuOpen(false); }}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg font-medium text-sm ${
                          isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-ink-50'
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${isActive ? 'text-brand-600' : 'text-ink-400'}`} />
                        <span>{sec.label}</span>
                      </button>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              {activeSection === 'overview' && <OverviewTab results={results} />}
              {activeSection === 'skills' && <KeywordsTab results={results} />}
              {activeSection === 'issues' && <StructureTab results={results} />}
              {activeSection === 'optimizer' && <SuggestionsTab results={results} resumeId={id} />}
              {activeSection === 'interview' && <InterviewPrepTab resumeId={id} />}
              {activeSection === 'roadmap' && <LearningRoadmapTab resumeId={id} />}
              {activeSection === 'projects' && <ProjectAnalysisTab resumeId={id} />}
            </motion.div>
          </div>

        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// OVERVIEW TAB
// -------------------------------------------------------------
const OverviewTab = ({ results }) => {
  const { scoreBreakdown, recommendations } = results;

  return (
    <div className="space-y-8">
      <ScoreOverview score={results.overallScore} />

      {/* Score Breakdown Area */}
      <div>
        <h3 className="heading-3 mb-6">Component Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {Object.entries(scoreBreakdown || {}).map(([key, item]) => {
            const isGood = item.score >= 80;
            const isWarn = item.score >= 60 && item.score < 80;
            return (
              <div key={key} className="surface-card p-5 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-ink-900 capitalize mb-3 text-sm">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </h4>
                  <div className={`text-3xl font-black mb-4 ${
                    isGood ? 'text-emerald-600' : isWarn ? 'text-amber-600' : 'text-rose-600'
                  }`}>
                    {item.score}<span className="text-sm font-medium text-ink-400">/100</span>
                  </div>
                </div>
                <p className="text-xs text-ink-600 leading-relaxed bg-ink-50 p-3 rounded-lg border border-ink-100">{item.evidence}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recommendations */}
      <div>
        <h3 className="heading-3 mb-6">Priority Recommendations</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(recommendations || []).map((rec, index) => (
            <div key={index} className="surface-card p-6 border-l-4 border-l-brand-500">
              <div className="flex items-start">
                <Lightbulb className="w-5 h-5 text-brand-500 mr-3 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-ink-900 block mb-1">{rec.category}</span>
                  <span className="text-ink-600 text-sm leading-relaxed block mb-3">{rec.suggestion}</span>
                  {rec.evidenceJD && (
                    <div className="text-xs text-brand-800 bg-brand-50 p-2.5 rounded-lg border border-brand-100">
                      <strong>JD Context:</strong> {rec.evidenceJD}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// SKILLS TAB
// -------------------------------------------------------------
const KeywordsTab = ({ results }) => {
  const { strongMatches, partialMatches, missingRequired, missingPreferred } = results.skillMatches || {};

  return (
    <div className="space-y-8">
      <div className="surface-card p-8 bg-gradient-to-br from-white to-ink-50">
        <h2 className="heading-2 mb-2">Skill Intelligence</h2>
        <p className="body-base">Review your exact skill alignments based on deep contextual matching against the target role.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Strong Matches */}
        <div className="surface-card p-6 border-t-4 border-t-emerald-500">
          <h3 className="heading-4 mb-4 flex items-center text-emerald-900">
            <CheckCircle className="w-5 h-5 mr-2 text-emerald-500" />
            Matched Skills
            <span className="ml-auto bg-emerald-100 text-emerald-800 text-xs py-1 px-3 rounded-full">{(strongMatches || []).length}</span>
          </h3>
          <ul className="space-y-3">
            {(strongMatches || []).map((match, index) => (
              <li key={index} className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100/50">
                <div className="flex justify-between items-start mb-1">
                  <strong className="text-emerald-950">{match.jdEvidence}</strong>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-1 rounded">{(match.confidence * 100).toFixed(0)}% Match</span>
                </div>
                <div className="text-sm text-emerald-700/80 mt-2 bg-white/60 p-2 rounded">{match.resumeEvidence}</div>
              </li>
            ))}
            {!(strongMatches || []).length && <p className="text-sm text-ink-500 p-4">No strong matches found.</p>}
          </ul>
        </div>

        {/* Partial Matches */}
        <div className="surface-card p-6 border-t-4 border-t-amber-500">
          <h3 className="heading-4 mb-4 flex items-center text-amber-900">
            <TrendingUp className="w-5 h-5 mr-2 text-amber-500" />
            Partial Alignments
            <span className="ml-auto bg-amber-100 text-amber-800 text-xs py-1 px-3 rounded-full">{(partialMatches || []).length}</span>
          </h3>
          <ul className="space-y-3">
            {(partialMatches || []).map((match, index) => (
              <li key={index} className="p-4 bg-amber-50/50 rounded-xl border border-amber-100/50">
                <div className="mb-2">
                  <strong className="text-amber-950">{match.jdEvidence}</strong> 
                  <span className="text-amber-600 mx-2">→</span> 
                  <span className="text-sm font-semibold text-amber-800">{match.resumeSkill}</span>
                </div>
                <div className="text-sm text-amber-700/80 bg-white/60 p-2 rounded">{match.resumeEvidence}</div>
              </li>
            ))}
            {!(partialMatches || []).length && <p className="text-sm text-ink-500 p-4">No partial matches found.</p>}
          </ul>
        </div>

        {/* Missing Required */}
        <div className="surface-card p-6 border-t-4 border-t-rose-500">
          <h3 className="heading-4 mb-4 flex items-center text-rose-900">
            <AlertCircle className="w-5 h-5 mr-2 text-rose-500" />
            Missing Required
            <span className="ml-auto bg-rose-100 text-rose-800 text-xs py-1 px-3 rounded-full">{(missingRequired || []).length}</span>
          </h3>
          <ul className="space-y-3">
            {(missingRequired || []).map((match, index) => (
              <li key={index} className="p-4 bg-rose-50/50 rounded-xl border border-rose-100/50">
                <strong className="text-rose-950">{match.jdEvidence}</strong>
                <div className="text-sm text-rose-700/80 mt-2 bg-white/60 p-2 rounded">{match.resumeEvidence}</div>
              </li>
            ))}
            {!(missingRequired || []).length && <p className="text-sm text-ink-500 p-4">All required skills met!</p>}
          </ul>
        </div>

        {/* Missing Preferred */}
        <div className="surface-card p-6 border-t-4 border-t-ink-400">
          <h3 className="heading-4 mb-4 flex items-center text-ink-800">
            <AlertCircle className="w-5 h-5 mr-2 text-ink-400" />
            Missing Preferred
            <span className="ml-auto bg-ink-100 text-ink-600 text-xs py-1 px-3 rounded-full">{(missingPreferred || []).length}</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {(missingPreferred || []).map((match, index) => (
              <span key={index} className="px-3 py-1.5 bg-ink-50 border border-ink-200 text-ink-700 rounded-lg text-sm font-semibold shadow-sm">
                {match.skill}
              </span>
            ))}
            {!(missingPreferred || []).length && <p className="text-sm text-ink-500 p-4">All preferred skills met!</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// STRUCTURE TAB
// -------------------------------------------------------------
const StructureTab = ({ results }) => {
  const { resumeIssues } = results;

  return (
    <div className="space-y-8">
      <div className="surface-card p-8">
        <h2 className="heading-2 mb-2">Quality Audit</h2>
        <p className="body-base">Identified formatting, grammatical, or structural issues affecting your ATS parsability.</p>
      </div>

      {resumeIssues && resumeIssues.length > 0 ? (
        <div className="grid gap-4">
          {resumeIssues.map((issue, index) => (
            <div key={index} className="surface-card p-6 border-l-4 border-l-amber-500 flex items-start">
              <AlertCircle className="w-6 h-6 text-amber-500 mr-4 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center space-x-3 mb-2">
                  <span className="font-bold text-ink-950 text-lg">{issue.type}</span>
                  <span className={`text-xs px-2 py-1 rounded font-bold uppercase tracking-wider ${
                    issue.severity === 'high' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {issue.severity} priority
                  </span>
                </div>
                <p className="text-ink-700 mb-3">{issue.issue}</p>
                {issue.context && (
                  <div className="text-sm text-ink-600 bg-ink-50 p-3 rounded-lg border border-ink-200 font-mono">
                    "{issue.context}"
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="surface-card p-12 text-center flex flex-col items-center">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-10 h-10" />
          </div>
          <h3 className="heading-3 mb-2 text-emerald-950">Excellent Structure</h3>
          <p className="text-ink-600">No major quality or parsability issues were detected in your resume structure.</p>
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// OPTIMIZER TAB
// -------------------------------------------------------------
const SuggestionsTab = ({ results, resumeId }) => {
  const { structuredResume } = results;
  const [selectedBullet, setSelectedBullet] = useState(null);
  const [loadingOpt, setLoadingOpt] = useState(false);
  const [optimization, setOptimization] = useState(null);

  const handleOptimize = async (bullet, contextText) => {
    setLoadingOpt(true);
    setOptimization(null);
    setSelectedBullet(bullet);
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`/api/resumes/${resumeId}/optimize`, 
        { originalText: bullet, sectionContext: contextText },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setOptimization(response.data.data);
      }
    } catch (err) {
      toast.error('Optimization failed');
    } finally {
      setLoadingOpt(false);
    }
  };

  const handleAccept = async () => {
    try {
      const token = localStorage.getItem('token');
      const newFullText = (results.originalText || '').replace(selectedBullet, optimization.suggestedText);

      const response = await axios.post(`/api/resumes/${resumeId}/versions`, 
        { optimizedText: newFullText || optimization.suggestedText },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        toast.success(`Version ${response.data.data.versionNumber} saved successfully!`);
        setOptimization(null);
        setSelectedBullet(null);
        window.location.reload();
      }
    } catch (err) {
      toast.error('Failed to save optimized version');
    }
  };

  return (
    <div className="space-y-8">
      <div className="surface-card p-8 bg-gradient-to-r from-brand-900 to-brand-800 text-white">
        <h2 className="heading-2 mb-2 text-white flex items-center">
          <Star className="w-6 h-6 mr-3 text-brand-300" />
          AI Resume Optimizer
        </h2>
        <p className="text-brand-100 text-lg">Target a specific experience bullet to receive a metric-driven, ATS-optimized rewrite.</p>
      </div>

      <div className="space-y-6">
        {structuredResume?.experience?.map((exp, i) => (
          <div key={i} className="surface-card p-6">
            <h4 className="font-bold text-ink-950 text-lg">{exp.role} <span className="text-ink-400 font-normal">at</span> {exp.company}</h4>
            <div className="mt-4 space-y-3">
              {exp.achievements?.map((ach, j) => (
                <div key={j} className="flex flex-col sm:flex-row sm:items-start justify-between bg-ink-50 p-4 rounded-xl border border-ink-100 gap-4">
                  <span className="text-ink-700 text-sm leading-relaxed flex-1">{ach}</span>
                  <button 
                    onClick={() => handleOptimize(ach, exp.description || exp.role)}
                    className="shrink-0 flex items-center justify-center space-x-1.5 text-sm bg-white border border-brand-200 text-brand-700 font-semibold px-4 py-2 rounded-lg hover:bg-brand-50 hover:border-brand-300 transition-colors shadow-sm"
                  >
                    <Star className="w-4 h-4" />
                    <span>Optimize</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Optimization Modal */}
      {selectedBullet && (
        <div className="fixed inset-0 bg-ink-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-white border-b border-ink-100 p-6 flex justify-between items-center z-10">
              <h3 className="heading-3 flex items-center">
                <Star className="w-5 h-5 text-brand-500 mr-2" /> AI Rewrite Suggestion
              </h3>
              <button onClick={() => { setSelectedBullet(null); setOptimization(null); }} className="text-ink-400 hover:text-ink-600 bg-ink-50 p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              {loadingOpt ? (
                <div className="text-center py-16">
                  <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-ink-600 font-medium text-lg">Synthesizing ATS-optimized improvement...</p>
                </div>
              ) : optimization ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Original */}
                    <div className="flex flex-col h-full">
                      <div className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Original</div>
                      <div className="bg-rose-50 p-5 rounded-xl border border-rose-200 text-rose-900 text-sm leading-relaxed flex-1">
                        {optimization.originalText}
                      </div>
                    </div>
                    {/* Suggested */}
                    <div className="flex flex-col h-full">
                      <div className="text-xs font-bold text-brand-600 uppercase tracking-wider mb-2">Optimized</div>
                      <div className="bg-emerald-50 p-5 rounded-xl border border-emerald-200 text-emerald-950 font-medium text-sm leading-relaxed flex-1 shadow-inner">
                        {optimization.suggestedText}
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-ink-50 p-6 rounded-xl border border-ink-200">
                    <h4 className="font-bold text-ink-900 mb-2 flex items-center">
                      <Lightbulb className="w-4 h-4 mr-2 text-amber-500" /> Reasoning
                    </h4>
                    <p className="text-ink-700 text-sm leading-relaxed">{optimization.reasoning}</p>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start">
                    <AlertCircle className="w-5 h-5 text-amber-600 mr-3 shrink-0" />
                    <div>
                      <p className="font-bold text-amber-900 text-sm mb-1">Requires your verification</p>
                      <p className="text-amber-800 text-sm">AI suggestions may include inferred metrics. Verify that the rewrite accurately represents your actual experience before accepting.</p>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-4 pt-4 border-t border-ink-100">
                    <button onClick={() => { setSelectedBullet(null); setOptimization(null); }} className="btn-ghost">
                      Discard
                    </button>
                    <button onClick={handleAccept} className="btn-primary">
                      <CheckCircle className="w-4 h-4 mr-2" /> Accept & Save Version
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default ResultsPage;