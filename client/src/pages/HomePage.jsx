
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search, BarChart3, Lightbulb, CheckCircle, Zap,
  ArrowRight, Star, Users, TrendingUp
} from 'lucide-react';

const HomePage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const features = [
  {
    icon: Search,
    title: 'Advanced Keyword Intelligence',
    description: 'Extract job-specific keywords and essential skills using AI-powered semantic matching to boost visibility.'
  },
  {
    icon: BarChart3,
    title: 'Comprehensive Resume Scoring',
    description: 'Receive an in-depth evaluation of your resume’s structure, content, and keyword alignment for maximum ATS success.'
  },
  {
    icon: Lightbulb,
    title: 'Smart Improvement Insights',
    description: 'Get AI-curated suggestions with impactful action verbs and formatting tips to strengthen every section of your resume.'
  },
  {
    icon: CheckCircle,
    title: 'ATS Optimization Report',
    description: 'Verify formatting, layout, and structure to ensure your resume passes through top Applicant Tracking Systems without errors.'
  }
];


  const stats = [
    { icon: Users, value: '10,000+', label: 'Resumes Analyzed' },
    { icon: Star, value: '4.9/5', label: 'User Rating' },
    { icon: TrendingUp, value: '85%', label: 'Success Rate' },
    { icon: Zap, value: '< 30s', label: 'Analysis Time' }
  ];

  const cardVariants = {
    offscreen: { y: 50, opacity: 0 },
    onscreen: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        bounce: 0.4,
        duration: 0.8
      }
    }
  };

  return (
    <main className="min-h-screen bg-white">

      {/* Hero Section */}
      <section className="bg-slate-900 text-white" aria-label="Hero Section">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 grid lg:grid-cols-2 gap-12 items-center min-h-[80vh]">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center lg:text-left py-12 lg:py-0"
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6 leading-tight">
              Elevate Your Resume with <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-300">AI Precision</span>
            </h1>
            <p className="text-lg text-slate-300 mb-10 max-w-xl mx-auto lg:mx-0">
              Unlock the full potential of your resume using smart keyword detection, ATS compatibility checks, and AI-driven improvement tips. Tailor your resume to each job and boost your chances of getting noticed by recruiters and hiring systems.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link to="/analyze">
                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: "0px 0px 8px rgb(56, 189, 248)" }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-lg px-8 py-3 w-full sm:w-auto flex items-center justify-center gap-2 rounded-md transition-colors duration-300"
                >
                  Start Analysis
                  <ArrowRight className="w-5 h-5" />
                </motion.button>
              </Link>
              <Link to="/features">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold text-lg px-8 py-3 w-full sm:w-auto rounded-md transition-colors duration-300"
                >
                  Learn More
                </motion.button>
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="hidden lg:flex items-center justify-center h-full"
          >
            <div className="relative w-full max-w-md h-96 rounded-xl bg-slate-800/50 border border-slate-700 p-6 flex items-center justify-center">
              <div className="absolute top-0 left-0 w-32 h-32 bg-cyan-500/20 rounded-full blur-2xl animate-pulse"></div>
              <div className="absolute bottom-0 right-0 w-32 h-32 bg-sky-500/20 rounded-full blur-2xl animate-pulse delay-1000"></div>
              <div className="text-center">
                <Zap size={64} className="mx-auto text-sky-400 mb-4" />
                <p className="text-slate-300 font-medium">AI-Powered Resume Engine</p>
                <p className="text-xs text-slate-400">Real-time feedback and optimization</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-slate-800 text-white" aria-label="Stats Section">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map(({ icon: Icon, value, label }, index) => (
            <motion.div
              key={label}
              initial="offscreen"
              whileInView="onscreen"
              viewport={{ once: true, amount: 0.8 }}
              variants={{
                ...cardVariants,
                onscreen: {
                  ...cardVariants.onscreen,
                  transition: {
                    ...cardVariants.onscreen.transition,
                    delay: index * 0.1
                  }
                }
              }}
              className="text-center flex flex-col items-center"
            >
              <Icon className="w-8 h-8 text-sky-400 mb-3" />
              <div className="text-3xl font-bold text-white mb-1">{value}</div>
              <p className="text-slate-400 text-sm uppercase tracking-wider">{label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-white" aria-label="Features Section">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Built to Transform Your Resume into Results
            </h2>
            <p className="text-lg text-slate-600 max-w-3xl mx-auto">
              Leverage advanced AI to analyze, score, and enhance your resume with powerful insights tailored to job roles and hiring trends.
            </p>
          </div>
          <div className="space-y-20">
            {features.map(({ icon: Icon, title, description }, index) => (
              <motion.div
                key={title}
                initial="offscreen"
                whileInView="onscreen"
                viewport={{ once: true, amount: 0.5 }}
                variants={cardVariants}
                className={`flex flex-col md:flex-row items-center gap-12 ${index % 2 !== 0 ? 'md:flex-row-reverse' : ''}`}
              >
                <div className="md:w-1/2">
                  <h3 className="text-2xl font-bold text-slate-800 mb-3 flex items-center gap-3">
                    <div className="flex-shrink-0 w-10 h-10 bg-sky-100 text-sky-600 rounded-lg flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    {title}
                  </h3>
                  <p className="text-slate-600 text-lg leading-relaxed">{description}</p>
                </div>
                <div className="md:w-1/2 w-full h-64 bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200">
                  <Icon className="w-16 h-16 text-slate-300" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-sky-500 to-cyan-500 relative overflow-hidden" aria-label="Call to Action">
        <div className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full -translate-x-16 -translate-y-16 blur-2xl"></div>
        <div className="absolute bottom-0 right-0 w-72 h-72 bg-white/10 rounded-full translate-x-16 translate-y-16 blur-3xl"></div>
        <div className="max-w-7xl mx-auto px-4 text-center text-white relative">
          <motion.div
            initial="offscreen"
            whileInView="onscreen"
            viewport={{ once: true, amount: 0.8 }}
            variants={cardVariants}
          >
            <h2 className="text-3xl md:text-4xl font-extrabold mb-4">
              Give Your Resume the Competitive Edge
            </h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto text-sky-100">
              Join 10,000+ users who’ve enhanced their resumes with real-time AI feedback, keyword optimization, and formatting that clears ATS filters with ease.
            </p>
            <Link to="/analyze">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-white text-sky-600 font-bold py-3 px-8 rounded-lg text-lg hover:bg-slate-100 transition-colors duration-300 shadow-lg"
              >
                Get Started Now <ArrowRight className="inline-block ml-2 w-5 h-5" />
              </motion.button>
            </Link>
          </motion.div>
        </div>
      </section>
    </main>
  );
};

export default HomePage;
