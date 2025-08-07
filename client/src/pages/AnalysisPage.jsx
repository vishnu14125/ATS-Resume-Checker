
import React from 'react';

const AnalysisPage = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Analyze Your Resume
          </h1>
          <p className="text-lg text-gray-600">
            Upload your resume and job description to receive AI insights.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Resume Upload
            </h2>
          </div>

          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Job Description
            </h2>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisPage;
