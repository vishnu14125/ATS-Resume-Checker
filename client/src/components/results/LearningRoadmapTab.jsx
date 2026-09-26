import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { TrendingUp, BookOpen, RefreshCw, Target } from 'lucide-react';
import toast from 'react-hot-toast';

const LearningRoadmapTab = ({ resumeId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchRoadmap = async (generate = false) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const method = generate ? 'post' : 'get';
      const res = await axios[method](`/api/career/${resumeId}/learning-roadmap`, 
        generate ? {} : undefined,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.data) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error(err);
      if (generate) toast.error("Failed to generate roadmap. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoadmap(false);
  }, [resumeId]);

  if (loading && !data) {
    return (
      <div className="surface-card p-16 text-center">
        <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-ink-600 font-medium text-lg">Synthesizing learning path...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="surface-card p-12 text-center">
        <div className="w-16 h-16 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <TrendingUp className="w-8 h-8" />
        </div>
        <h3 className="heading-3 mb-2">Learning Roadmap</h3>
        <p className="body-base max-w-md mx-auto mb-8">Generate a custom learning path to address your identified skill gaps and improve your ATS fit for this role.</p>
        <button onClick={() => fetchRoadmap(true)} className="btn-primary px-8">
          <RefreshCw className="w-4 h-4 mr-2" /> Generate Roadmap
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
              <TrendingUp className="w-6 h-6 mr-3 text-brand-500" />
              Learning Roadmap
            </h2>
            <p className="body-base">A structured path to close your skill gaps and achieve full role readiness.</p>
          </div>
          <button onClick={() => fetchRoadmap(true)} className="btn-secondary whitespace-nowrap">
            <RefreshCw className="w-4 h-4 mr-2" /> Regenerate
          </button>
        </div>
      </div>

      <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-brand-200 before:via-brand-400 before:to-transparent">
        {data.milestones.map((milestone, index) => (
          <div key={index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
            {/* Timeline dot */}
            <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-brand-500 text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
              <Target className="w-4 h-4" />
            </div>
            
            {/* Card */}
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] surface-card p-6 border-t-4 border-t-brand-500 hover:-translate-y-1 transition-transform">
              <div className="flex items-center justify-between mb-3">
                <span className="badge-brand">{milestone.title}</span>
                <span className="text-xs font-bold text-ink-400 uppercase tracking-wider">{milestone.estimatedTime}</span>
              </div>
              <p className="text-ink-700 text-sm mb-4 leading-relaxed">{milestone.description}</p>
              
              <div className="bg-ink-50 rounded-lg p-3">
                <p className="text-xs font-bold text-ink-800 uppercase tracking-wider mb-2 flex items-center">
                  <BookOpen className="w-3 h-3 mr-1" /> Resources
                </p>
                <ul className="space-y-1.5">
                  {milestone.resources.map((res, i) => (
                    <li key={i} className="text-sm text-ink-600 flex items-start">
                      <span className="text-brand-400 mr-2">•</span> {res}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LearningRoadmapTab;
