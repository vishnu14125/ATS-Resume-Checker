import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, BarChart3, CheckCircle, FileText, Target, Shield, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const HomePage = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden bg-surface-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-sm font-semibold mb-8">
                <span className="flex h-2 w-2 rounded-full bg-brand-500 mr-2 animate-pulse"></span>
                AI Career Intelligence Platform
              </div>
              <h1 className="heading-1 mb-6">
                Understand your resume.<br />
                <span className="text-brand-600">Prepare for the jobs you want.</span>
              </h1>
              <p className="body-large mb-10 max-w-2xl mx-auto">
                Analyze job requirements, uncover skill gaps, optimize your resume, and prepare for interviews from one intelligent workspace. Built for developers, students, and serious job seekers.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
                <Link to={isAuthenticated ? "/analyze" : "/signup"}>
                  <button className="btn-primary w-full sm:w-auto text-lg px-8">
                    Analyze my resume
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </button>
                </Link>
                <Link to="/features">
                  <button className="btn-secondary w-full sm:w-auto text-lg px-8">
                    Explore the platform
                  </button>
                </Link>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Abstract Product Preview */}
        <div className="max-w-5xl mx-auto mt-20 px-4 sm:px-6 lg:px-8 relative">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="surface-card p-2 md:p-4 overflow-hidden relative shadow-2xl shadow-brand-900/5 border-ink-200/50"
          >
            <div className="bg-ink-50 rounded-xl overflow-hidden border border-ink-200/50">
              <div className="flex border-b border-ink-200 bg-white px-4 py-3">
                <div className="flex space-x-2">
                  <div className="w-3 h-3 rounded-full bg-rose-400"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 md:p-8 bg-surface-bg">
                {/* Left Column: Score */}
                <div className="surface-card p-6 flex flex-col items-center justify-center text-center">
                  <div className="w-24 h-24 rounded-full border-8 border-brand-500 flex items-center justify-center mb-4">
                    <span className="text-3xl font-black text-ink-900">85</span>
                  </div>
                  <h3 className="font-bold text-ink-900">Strong Match</h3>
                  <p className="text-sm text-ink-500 mt-1">Based on required skills</p>
                </div>
                
                {/* Middle Column: Skills */}
                <div className="surface-card p-6 col-span-2">
                  <h3 className="font-bold text-ink-900 mb-4 flex items-center">
                    <Target className="w-4 h-4 mr-2 text-brand-500" /> Skill Gaps Identified
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                      <span className="font-semibold text-emerald-900 text-sm">React / Node.js</span>
                      <span className="badge-success">Matched</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-100">
                      <span className="font-semibold text-amber-900 text-sm">Docker</span>
                      <span className="badge-warning">Partial</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-rose-50 border border-rose-100">
                      <span className="font-semibold text-rose-900 text-sm">Kubernetes</span>
                      <span className="badge-error">Missing</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="heading-2 mb-4">Actionable Intelligence</h2>
            <p className="body-large">Stop guessing what the ATS wants. Get deterministic feedback and AI-powered recommendations to land the interview.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="surface-card p-8">
              <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center mb-6">
                <BarChart3 className="w-6 h-6 text-brand-600" />
              </div>
              <h3 className="heading-4 mb-3">Deterministic Scoring</h3>
              <p className="body-base">Transparent, rule-based ATS scoring that shows exactly why you matched or missed key requirements.</p>
            </div>
            
            <div className="surface-card p-8">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-6">
                <Zap className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="heading-4 mb-3">AI Resume Optimization</h3>
              <p className="body-base">Rewrite weak bullet points automatically. AI suggests impactful, metric-driven achievements tailored to the JD.</p>
            </div>

            <div className="surface-card p-8">
              <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mb-6">
                <FileText className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="heading-4 mb-3">Targeted Prep</h3>
              <p className="body-base">Generate situational interview questions and personalized learning roadmaps based on your exact skill gaps.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
