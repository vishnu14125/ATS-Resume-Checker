import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Plus, FileText, ArrowRight, Loader2, AlertCircle, TrendingUp, Lightbulb, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';

const DashboardPage = () => {
  const navigate = useNavigate();
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchResumes = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('/api/resumes', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data.success) {
          setResumes(response.data.data);
        }
      } catch (err) {
        console.error('Failed to fetch resumes:', err);
        setError('Failed to load your intelligence data. Please try again later.');
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchResumes();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this analysis?')) return;
    try {
      const token = localStorage.getItem('token');
      const response = await axios.delete(`/api/resumes/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setResumes(resumes.filter(r => r._id !== id));
        toast.success('Analysis deleted successfully');
      }
    } catch (err) {
      console.error('Failed to delete resume:', err);
      toast.error('Failed to delete analysis');
    }
  };

  const getScoreColor = (score) => {
    if (!score) return 'badge-neutral';
    if (score >= 80) return 'badge-success';
    if (score >= 60) return 'badge-warning';
    return 'badge-error';
  };

  return (
    <div className="min-h-screen bg-surface-bg pb-20">
      {/* Dashboard Header Context */}
      <header className="bg-white border-b border-ink-200 py-10 mb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="heading-2 mb-2">Career Workspace</h1>
              <p className="body-base max-w-2xl">
                Manage your resume alignments, prepare for interviews, and track your learning milestones.
              </p>
            </div>
            <div className="mt-6 md:mt-0 flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
              <Link to="/analyze">
                <button className="btn-primary w-full">
                  <Plus className="w-5 h-5 mr-2" />
                  Analyze New Job
                </button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {loading ? (
          <div className="flex flex-col justify-center items-center h-64 space-y-4">
            <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
            <p className="text-ink-500 font-medium">Loading workspace...</p>
          </div>
        ) : error ? (
          <div className="bg-rose-50 border-l-4 border-rose-500 p-6 rounded-r-xl flex items-start">
            <AlertCircle className="w-6 h-6 text-rose-600 mr-4 mt-0.5 shrink-0" />
            <div>
              <h3 className="heading-4 text-rose-900 mb-1">Error Loading Data</h3>
              <p className="text-rose-700">{error}</p>
            </div>
          </div>
        ) : resumes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-24 h-24 bg-brand-50 text-brand-500 rounded-3xl flex items-center justify-center mb-6 border border-brand-100 shadow-sm">
              <FileText className="w-10 h-10" />
            </div>
            <h3 className="heading-3 mb-3">No analyses found</h3>
            <p className="body-large max-w-md mx-auto mb-8">
              Upload your resume and a target job description to generate your first career intelligence report.
            </p>
            <Link to="/analyze">
              <button className="btn-primary px-8">
                Start First Analysis
                <ArrowRight className="w-5 h-5 ml-2" />
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-12">
            
            {/* Quick Insights Section */}
            <section>
              <h2 className="heading-4 mb-6 flex items-center">
                <TrendingUp className="w-5 h-5 mr-2 text-ink-400" />
                Recent Intelligence
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="surface-card p-6">
                  <p className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-2">Total Analyses</p>
                  <p className="text-4xl font-extrabold text-ink-950">{resumes.length}</p>
                </div>
                <div className="surface-card p-6">
                  <p className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-2">Avg. Match Score</p>
                  <p className="text-4xl font-extrabold text-brand-600">
                    {Math.round(resumes.reduce((acc, curr) => acc + (curr.overallScore || 0), 0) / resumes.length)}
                  </p>
                </div>
                <div className="surface-card p-6 border-l-4 border-l-brand-500">
                  <div className="flex items-start space-x-3">
                    <Lightbulb className="w-6 h-6 text-brand-500 shrink-0 mt-1" />
                    <div>
                      <p className="text-sm font-bold text-ink-900 mb-1">Next Step</p>
                      <p className="text-sm text-ink-600">Review your most recent analysis and practice the suggested interview questions.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Resume / Job List */}
            <section>
              <h2 className="heading-4 mb-6 flex items-center">
                <BookOpen className="w-5 h-5 mr-2 text-ink-400" />
                Your Targeted Roles
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {resumes.map((resume) => (
                  <div key={resume._id} className="surface-card flex flex-col h-full group">
                    <div className="p-6 flex-1 flex flex-col">
                      <div className="flex justify-between items-start mb-4">
                        <span className={`${getScoreColor(resume.overallScore)} px-3 py-1 rounded-full text-sm font-bold`}>
                          {resume.overallScore ? `${resume.overallScore} Match` : 'Processing'}
                        </span>
                        
                        <button 
                          onClick={() => handleDelete(resume._id)}
                          className="text-ink-400 hover:text-rose-600 p-1 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                          title="Delete Analysis"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                        </button>
                      </div>
                      
                      <div className="mb-4">
                        <h3 className="font-bold text-ink-950 text-lg mb-1 line-clamp-2" title={resume.jobDescription}>
                          {resume.jobDescription || 'Unknown Target Role'}
                        </h3>
                        <p className="text-sm text-ink-500">
                          Analyzed on {new Date(resume.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </p>
                      </div>

                      <div className="mt-auto pt-4 border-t border-ink-100 flex items-center text-sm text-ink-600">
                        <FileText className="w-4 h-4 mr-2" />
                        <span className="truncate" title={resume.fileName}>{resume.fileName || 'Base Resume'}</span>
                      </div>
                    </div>

                    <Link to={`/results/${resume._id}`} className="w-full">
                      <button className="w-full bg-ink-50 hover:bg-brand-50 text-ink-700 hover:text-brand-700 py-4 font-bold transition-colors flex items-center justify-center rounded-b-2xl border-t border-ink-200">
                        View Intelligence <ArrowRight className="w-4 h-4 ml-2" />
                      </button>
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

      </main>
    </div>
  );
};

export default DashboardPage;
