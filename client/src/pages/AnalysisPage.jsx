
import React from 'react';
import { useDropzone } from 'react-dropzone';
import { FileText, Upload } from 'lucide-react';

const AnalysisPage = () => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone();

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Analyze Your Resume
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Resume Upload Section */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              Resume Upload
            </h2>

            <div
              {...getRootProps()}
              className="border-2 border-dashed rounded-lg p-8 text-center"
            >
              <input {...getInputProps()} />
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p>Drop your resume or click to upload</p>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Or paste resume text:
              </label>
              <textarea
                placeholder="Paste your resume content here..."
                className="input-field h-32 resize-none w-full border p-2"
              />
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
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisPage;
