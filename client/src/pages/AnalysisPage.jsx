import React, { useState } from 'react';

const AnalysisPage = () => {
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [error, setError] = useState('');

  const handleAnalyze = () => {
    if (!resumeText.trim()) {
      setError('Please paste your resume text.');
      return;
    }
    if (!jobDescription.trim()) {
      setError('Please paste the job description.');
      return;
    }
    setError('');
    alert('Resume analysis triggered! (mock)');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-8 text-center">Analyze Your Resume</h1>

        {error && (
          <div className="mb-6 bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Resume Text Input */}
          <div>
            <label className="block mb-2 font-semibold">Paste your resume text:</label>
            <textarea
              className="w-full border rounded p-2 h-40 resize-none"
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your resume content here..."
            />
          </div>

          {/* Job Description Input */}
          <div>
            <label className="block mb-2 font-semibold">Paste the job description:</label>
            <textarea
              className="w-full border rounded p-2 h-40 resize-none"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the job description here..."
            />
          </div>
        </div>

        <div className="text-center mt-8">
          <button
            onClick={handleAnalyze}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded"
          >
            Analyze Resume
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnalysisPage;
