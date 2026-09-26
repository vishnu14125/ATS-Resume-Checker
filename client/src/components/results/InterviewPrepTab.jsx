import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Lightbulb, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const InterviewPrepTab = ({ resumeId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchPrep = async (generate = false) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const method = generate ? 'post' : 'get';
      const res = await axios[method](`/api/career/${resumeId}/interview-prep`, 
        generate ? {} : undefined,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.data) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error(err);
      if (generate) toast.error("Failed to generate prep. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrep(false);
  }, [resumeId]);

  const updateStatus = async (qId, status) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/career/${resumeId}/interview-prep/${qId}`, 
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setData(prev => ({
        ...prev,
        questions: prev.questions.map(q => q._id === qId ? { ...q, status } : q)
      }));
    } catch (err) {
      console.error(err);
      toast.error('Failed to update status');
    }
  };

  if (loading && !data) {
    return (
      <div className="surface-card p-16 text-center">
        <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-ink-600 font-medium text-lg">Generating tailored interview intelligence...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="surface-card p-12 text-center">
        <div className="w-16 h-16 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lightbulb className="w-8 h-8" />
        </div>
        <h3 className="heading-3 mb-2">Interview Preparation Workspace</h3>
        <p className="body-base max-w-md mx-auto mb-8">Generate situational and technical interview questions based strictly on your identified skill gaps and experience.</p>
        <button onClick={() => fetchPrep(true)} className="btn-primary px-8">
          <RefreshCw className="w-4 h-4 mr-2" /> Generate Prep Material
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
              <Lightbulb className="w-6 h-6 mr-3 text-brand-500" />
              Interview Preparation
            </h2>
            <p className="body-base">Tailored questions to help you defend your experience and address your skill gaps.</p>
          </div>
          <button onClick={() => fetchPrep(true)} className="btn-secondary whitespace-nowrap">
            <RefreshCw className="w-4 h-4 mr-2" /> Regenerate
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {data.questions.map((q) => {
          const isPracticed = q.status === 'practiced';
          return (
            <div key={q._id} className={`surface-card p-6 border-l-4 transition-colors ${
              isPracticed ? 'border-l-emerald-500 bg-emerald-50/20' : 'border-l-brand-500'
            }`}>
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-3">
                    <span className="badge-brand">{q.category}</span>
                    {isPracticed && <span className="badge-success flex items-center"><CheckCircle className="w-3 h-3 mr-1"/> Practiced</span>}
                  </div>
                  <h3 className="heading-4 text-ink-950 mb-3">{q.question}</h3>
                  <div className="bg-ink-50 p-4 rounded-xl border border-ink-100">
                    <p className="text-sm font-bold text-ink-700 mb-1 flex items-center">
                      <AlertCircle className="w-4 h-4 mr-1 text-ink-400" /> Suggested Guidance
                    </p>
                    <p className="text-sm text-ink-600 leading-relaxed">{q.suggestedFocus}</p>
                  </div>
                </div>
                
                <div className="shrink-0 flex items-start md:w-40 pt-2">
                  {!isPracticed ? (
                    <button 
                      onClick={() => updateStatus(q._id, 'practiced')}
                      className="w-full btn-ghost border border-ink-200"
                    >
                      Mark Practiced
                    </button>
                  ) : (
                    <button 
                      onClick={() => updateStatus(q._id, 'pending')}
                      className="w-full text-sm font-medium text-ink-500 hover:text-ink-700 transition-colors"
                    >
                      Undo
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
};

export default InterviewPrepTab;
