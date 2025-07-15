import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const Signup = () => {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Signup failed');

      navigate('/login');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#e3f2fd] flex items-center justify-center px-4">
      <div className="flex w-full max-w-5xl rounded-xl overflow-hidden shadow-xl bg-white">
        {/* Left Panel */}
        <div className="w-1/2 hidden md:flex flex-col justify-center px-10 py-12 bg-[#bbdefb]">
          <h2 className="text-3xl font-bold mb-6 text-gray-900 leading-snug">
            Create a resume you <br />are proud of
          </h2>
          <ul className="space-y-5 text-base text-gray-700">
            <li>✔ Ensure job-relevant sections like Projects and Skills are included.</li>
            <li>✔ Compare with job descriptions and get match percentage.</li>
            <li>✔ Export a professional feedback report as downloadable PDF.</li>
          </ul>
        </div>

        {/* Right Panel */}
        <div className="w-full md:w-1/2 flex flex-col justify-center px-10 py-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">Create your account</h2>

          <form className="space-y-5" onSubmit={handleSignup}>
            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div>
              <label className="block mb-1 text-sm font-medium">Your Name</label>
              <input
                type="text"
                name="name"
                required
                value={form.name}
                onChange={handleChange}
                placeholder="John Doe"
                className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">Email</label>
              <input
                type="email"
                name="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">Password</label>
              <input
                type="password"
                name="password"
                required
                value={form.password}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold py-2 rounded-md"
            >
              CREATE AN ACCOUNT
            </button>

            <p className="text-sm text-center mt-4 text-gray-600">
              Already have an account?{" "}
              <Link to="/login" className="text-purple-600 hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Signup;
