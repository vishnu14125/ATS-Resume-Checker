import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, FileText, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

const Signup = () => {
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Registration failed');

      const token = data.data?.token || data.token;
      login(token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-bg flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-brand-100/40 rounded-full blur-3xl opacity-60 pointer-events-none"></div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <Link to="/" className="flex justify-center items-center space-x-2 mb-8 group">
          <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold text-ink-900 tracking-tight">AI Career Intelligence</span>
        </Link>
        <h2 className="text-center text-3xl font-extrabold text-ink-950 tracking-tight">
          Create your account
        </h2>
        <p className="mt-2 text-center text-sm text-ink-500">
          Start aligning your skills with your target career
        </p>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10"
      >
        <div className="surface-card py-8 px-4 sm:px-10">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <p className="text-sm text-rose-800 font-medium">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="name" className="label-base">
                Full Name
              </label>
              <div className="mt-1">
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="input-base"
                  placeholder="John Doe"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="label-base">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="input-base"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="label-base">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="input-base"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full group"
              >
                {loading ? 'Creating account...' : 'Create account'}
                {!loading && <ArrowRight className="w-4 h-4 ml-2 opacity-50 group-hover:opacity-100 transition-opacity" />}
              </button>
            </div>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-ink-600">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-500 transition-colors">
                Sign in instead
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Signup;
