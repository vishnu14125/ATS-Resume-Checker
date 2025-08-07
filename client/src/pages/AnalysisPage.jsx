
import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileText, Upload, CheckCircle, AlertCircle } from 'lucide-react';

const AnalysisPage = () => {
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [error, setError] = useState('');

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc', '.docx'],
      'text/plain': ['.txt']
    },
    onDrop: (acceptedFiles) => {
      setResumeFile(acceptedFiles[0]);
      setError('');
    },
  });

  const handleAnalyze = () => {
    if (!(resumeFile || resumeText.trim())) {
      setError('Please upload a resume file or paste resume content.');
      return;
    }
    if (!jobDescription.trim()) {
      setError('Please paste the job description.');
      return;
    }

    setError('');
    // Trigger analysis (mocked for now)
    alert('Resume analysis triggered!');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Analyze Your Resume
          </h1>
        </div>

        {error && (
          <div className="mb-6 bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded flex items-center">
            <AlertCircle className="w-4 h-4 mr-2" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Resume Upload Section */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              Resume Upload
            </h2>

            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center ${isDragActive ? 'bg-blue-50 border-blue-400' : ''}`}
            >
              <input {...getInputProps()} />
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p>{isDragActive ? "Drop your resume here..." : "Drop your resume or click to upload"}</p>
              {resumeFile && (
                <p className="mt-4 text-sm text-green-600 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 mr-1" /> {resumeFile.name} uploaded
                </p>
              )}
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Or paste resume text:
              </label>
              <textarea
                placeholder="Paste your resume content here..."
                className="input-field h-32 resize-none w-full border p-2"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
              />
              {resumeText && (
                <p className="text-xs text-gray-500 mt-1">Characters: {resumeText.length}</p>
              )}
            </div>
          </div>

          {/* Job Description */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              Job Description
            </h2>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              Paste the job description:
            </label>
            <textarea
              placeholder="Paste the job description here..."
              className="input-field h-64 resize-none w-full border p-2"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
            {jobDescription && (
              <p className="text-xs text-gray-500 mt-1">Words: {jobDescription.trim().split(/\s+/).length}</p>
            )}
          </div>
        </div>

        <div className="mt-10 text-center">
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
