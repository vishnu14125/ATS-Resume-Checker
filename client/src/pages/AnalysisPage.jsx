import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';

const AnalysisPage = () => {
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [error, setError] = useState('');

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
    onDrop: (acceptedFiles) => {
      setResumeFile(acceptedFiles[0]);
      setError('');
    },
    onDropRejected: () => {
      setError('File type not supported or file is too large.');
    }
  });

  const removeFile = () => {
    setResumeFile(null);
  };

  const handleAnalyze = () => {
    if (!resumeFile && !resumeText.trim()) {
      setError('Please upload a resume file or paste resume content.');
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
          <div className="mb-6 bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Resume Upload Section */}
          <div className="border rounded p-4">
            <label className="block mb-2 font-semibold flex items-center">
              <FileText className="mr-2" /> Resume Upload
            </label>

            {!resumeFile ? (
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded p-8 text-center cursor-pointer ${
                  isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-500'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="mx-auto mb-2" size={40} />
                {isDragActive ? (
                  <p className="text-blue-600 font-medium">Drop your resume here...</p>
                ) : (
                  <p>Drag & drop your resume here, or click to browse (PDF, DOCX, TXT)</p>
                )}
              </div>
            ) : (
              <div className="flex justify-between items-center border p-3 rounded bg-green-50">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="text-green-600" />
                  <span>{resumeFile.name}</span>
                </div>
                <button
                  onClick={removeFile}
                  className="text-gray-600 hover:text-gray-900 font-bold"
                  aria-label="Remove file"
                >
                  ×
                </button>
              </div>
            )}

            {/* Optional manual resume text input */}
            <div className="mt-4">
              <label className="block mb-1 font-medium">Or paste your resume text:</label>
              <textarea
                className="w-full border rounded p-2 h-32 resize-none"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste your resume content here..."
              />
            </div>
          </div>

          {/* Job Description Input */}
          <div className="border rounded p-4">
            <label className="block mb-2 font-semibold flex items-center">
              <FileText className="mr-2" /> Job Description
            </label>
            <textarea
              className="w-full border rounded p-2 h-64 resize-none"
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
