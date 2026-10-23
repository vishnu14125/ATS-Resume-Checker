import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { loginUser, registerUser, errorMessage } from '../lib/api';

const COPY = {
  login: { title: 'Welcome back', intro: 'Log in to see your analyses and run a new one.', submit: 'Log in', busy: 'Logging in…', failed: 'Login failed. Please try again.', prompt: "Don't have an account?", other: 'Sign up', otherTo: '/signup' },
  signup: { title: 'Create your account', intro: 'It takes a minute. Then upload your resume for its first analysis.', submit: 'Create account', busy: 'Creating account…', failed: 'Registration failed. Please try again.', prompt: 'Already have an account?', other: 'Log in', otherTo: '/login' },
};

const POINTS = [
  'A Resume Health score with a breakdown of where the points came from.',
  'An optional Job Match against any job description, with the evidence for each requirement.',
  'A prioritised list of specific changes to make next.',
];

/** Login and sign-up share one form; sign-up adds the name field. */
const AuthPage = ({ mode }) => {
  const isSignup = mode === 'signup';
  const copy = COPY[mode];
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { name, email, password } = form;
      login(await (isSignup ? registerUser({ name, email, password }) : loginUser({ email, password })));
      navigate('/dashboard');
    } catch (err) {
      setError(errorMessage(err, copy.failed));
      setLoading(false);
    }
  };

  return (
    <div className="page grid animate-rise grid-cols-1 items-stretch gap-6 lg:grid-cols-2 lg:py-14">
      <div className="mx-auto w-full max-w-md lg:py-6">
        <h1 className="page-title">{copy.title}</h1>
        <p className="mt-2 text-muted">{copy.intro}</p>

        <form onSubmit={handleSubmit} className="card mt-6 space-y-4 p-6 sm:p-7">
          {error && <p role="alert" className="alert alert-danger">{error}</p>}

          {isSignup && (
            <div>
              <label htmlFor="name" className="label">Full name</label>
              <input id="name" name="name" type="text" autoComplete="name" required maxLength={100} value={form.name} onChange={handleChange} className="input" />
            </div>
          )}

          <div>
            <label htmlFor="email" className="label">Email address</label>
            <input id="email" name="email" type="email" autoComplete="email" required value={form.email} onChange={handleChange} className="input" />
          </div>

          <div>
            <label htmlFor="password" className="label">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
              minLength={isSignup ? 8 : undefined}
              aria-describedby={isSignup ? 'password-hint' : undefined}
              value={form.password}
              onChange={handleChange}
              className="input"
            />
            {isSignup && <p id="password-hint" className="mt-1 text-sm text-muted">At least 8 characters.</p>}
          </div>

          <button type="submit" disabled={loading} className="btn btn-lg btn-primary w-full">
            {loading && <span className="spinner" />}
            {loading ? copy.busy : copy.submit}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          {copy.prompt} <Link to={copy.otherTo} className="link">{copy.other}</Link>
        </p>
      </div>

      <aside className="hero hidden flex-col justify-center p-10 lg:flex">
        <h2 className="font-display text-3xl font-extrabold leading-tight">Understand your resume. Make it stronger.</h2>
        <ul className="mt-6 space-y-4 text-white/85">
          {POINTS.map((point) => (
            <li key={point} className="flex items-start gap-3">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success-bright/20 text-success-bright"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
              {point}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
};

export default AuthPage;
