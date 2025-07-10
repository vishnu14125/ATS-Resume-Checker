 
import React from "react";
import { FcGoogle } from "react-icons/fc";
import { Link } from "react-router-dom";

const Login = () => {
  // const handleGoogleLogin = () => {
  //   // console.log(import.meta.env.VITE_API_BASE_URL);
  //   window.open(`${import.meta.env.VITE_API_BASE_URL}/auth/google`, "_self");
  // };

  // console.log("✅ Frontend Env:", import.meta.env.VITE_API_BASE_URL);  // Add this line

const handleGoogleLogin = () => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL;
  if (!baseUrl) {
    alert("VITE_API_BASE_URL is not defined");
    return;
  }
  // window.open(`${baseUrl}/routes/auth`, "_self");
  window.open(`${baseUrl}/api/auth/google`, "_self"); // if using OAuth redirect method

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
            <li className="flex items-start gap-3">
              <span className="font-normal text-xl">
                Optimize your resume with ATS-focused <br /> keywords and formatting.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-normal text-xl">
                Instantly analyze each section <br /> using AI-driven scoring.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-normal text-xl">
                Ensure job-relevant sections like Projects <br /> and Skills are included.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-normal text-xl">
                Compare with job descriptions and <br /> get real-time match percentage.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-normal text-xl">
                Export a professional feedback report <br /> as downloadable PDF.
              </span>
            </li>
          </ul>
        </div>

        {/* Right Panel */}
        <div className="w-full md:w-1/2 flex flex-col justify-center px-10 py-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">Sign in to your account</h2>

          {/* Google Auth Button */}
          <button
            onClick={handleGoogleLogin}
            className="flex items-center justify-center gap-3 w-full border border-gray-300 rounded-md py-2 text-sm font-medium hover:bg-gray-100 transition"
          >
            <FcGoogle className="text-xl" />
            Continue with Google
          </button>

          <div className="flex items-center my-6">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="mx-4 text-gray-400 text-sm">or</span>
            <div className="flex-grow border-t border-gray-300"></div>
          </div>

          {/* Email/Password Login */}
          <form className="space-y-5">
            <div>
              <label className="block mb-1 text-sm font-medium">Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold py-2 rounded-md"
            >
              SIGN IN
            </button>

            <p className="text-sm text-center mt-4 text-gray-600">
              Don’t have an account?{" "}
              <Link to="/signup" className="text-purple-600 hover:underline font-medium">
                Create one
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
