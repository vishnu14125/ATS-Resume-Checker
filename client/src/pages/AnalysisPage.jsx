import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Upload, FileText, CheckCircle, X, AlertCircle, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

const AnalysisPage = () => {
  const navigate = useNavigate();
  const [uploadedFile, setUploadedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // File upload handler
  const onDrop = async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploadedFile(file);
    setFileName(file.name);

    const formData = new FormData();
    formData.append('resume', file);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/upload', formData, {
        headers: {
          Authorization: `Bearer ${token}`
        },
      });

      if (response.data.success) {
        setResumeText(response.data.data.text);
        toast.success('Resume extracted successfully');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to extract resume text');
      setUploadedFile(null);
      setFileName('');
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const removeFile = () => {
    setUploadedFile(null);
    setFileName('');
    setResumeText('');
  };

  const handleAnalysis = async () => {
    if (isAnalyzing) return;

    if (!resumeText.trim() || !jobDescription.trim()) {
      toast.error('Please provide both resume text and job description');
      return;
    }

    setIsAnalyzing(true);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/analyze', {
        resumeText: resumeText.trim(),
        jobDescription: jobDescription.trim(),
        fileName: fileName || 'Manual Text Input'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        toast.success('Analysis completed successfully!');
        navigate(`/results/${response.data.data.id}`);
      }
    } catch (error) {
      console.error('Analysis error:', error);
      if (error.response?.status === 429 || error.response?.status === 503) {
        toast.error('AI service is temporarily rate-limited. Please try again in a moment.', { duration: 6000 });
      } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        toast.error('The analysis took too long and timed out. Please try again.', { duration: 5000 });
      } else {
        toast.error(error.response?.data?.error?.message || 'Failed to analyze alignment');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-bg py-12">
      <div className="section-container max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="heading-1 mb-4">
              Analyze Job Alignment
            </h1>
            <p className="body-large max-w-2xl mx-auto">
              Upload your resume and the target job description. Our engine will deterministically score your fit and generate an intelligence report.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Step 1: Resume */}
            <div className="surface-card p-8 flex flex-col h-full">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-8 h-8 rounded-full bg-ink-100 text-ink-700 font-bold flex items-center justify-center">1</div>
                <h2 className="heading-3">Your Resume</h2>
              </div>

              {!uploadedFile ? (
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
                    isDragActive
                      ? 'border-brand-400 bg-brand-50 shadow-inner'
                      : 'border-ink-200 hover:border-brand-400 hover:bg-brand-50/50'
                  }`}
                >
                  <input {...getInputProps()} />
                  <div className="w-16 h-16 bg-white shadow-sm text-ink-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-ink-100">
                    <Upload className="w-8 h-8" />
                  </div>
                  {isDragActive ? (
                    <p className="text-brand-700 font-semibold text-lg">Drop your resume here...</p>
                  ) : (
                    <div>
                      <p className="text-ink-700 font-semibold mb-2">
                        Drag & drop your file here, or <span className="text-brand-600 underline decoration-brand-300 underline-offset-4">browse</span>
                      </p>
                      <p className="text-sm text-ink-500">
                        Supports PDF, DOCX, and TXT (Max 10MB)
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="border border-emerald-200 bg-emerald-50 rounded-2xl p-6 relative">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center min-w-0 pr-8">
                      <div className="w-12 h-12 bg-white shadow-sm text-emerald-600 rounded-xl flex items-center justify-center mr-4 shrink-0 border border-emerald-100">
                        <CheckCircle className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-ink-900 truncate block text-lg">{fileName}</span>
                        <p className="text-sm text-emerald-700 font-medium mt-0.5">Successfully extracted</p>
                      </div>
                    </div>
                    <button
                      onClick={removeFile}
                      className="text-ink-400 hover:text-rose-500 p-2 rounded-lg hover:bg-white transition-colors absolute top-4 right-4"
                      title="Remove file"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-8 flex-1 flex flex-col">
                <label className="label-base text-ink-500 flex justify-between">
                  <span>Or paste raw text:</span>
                  <span className="font-normal text-xs">{resumeText.length} chars</span>
                </label>
                <textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste your resume content here..."
                  className="input-base flex-1 min-h-[160px] resize-none font-mono text-sm leading-relaxed"
                  disabled={isAnalyzing}
                />
              </div>
            </div>

            {/* Step 2: JD */}
            <div className="surface-card p-8 flex flex-col h-full">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-ink-100 text-ink-700 font-bold flex items-center justify-center">2</div>
                  <h2 className="heading-3">Target Role</h2>
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                <label className="label-base text-ink-500 flex justify-between">
                  <span>Paste the complete job description:</span>
                  <span className="font-normal text-xs">{jobDescription.length} chars</span>
                </label>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Example: We are looking for a Senior Frontend Engineer with 5+ years of experience in React, TypeScript, and Node.js..."
                  className="input-base flex-1 min-h-[300px] resize-none font-mono text-sm leading-relaxed"
                  disabled={isAnalyzing}
                />
              </div>

              <div className="mt-6 p-4 bg-ink-50 border border-ink-100 rounded-xl flex items-start space-x-3">
                <Sparkles className="w-5 h-5 text-ink-400 shrink-0 mt-0.5" />
                <p className="text-sm text-ink-600 leading-relaxed">
                  <strong>Tip:</strong> Don't worry about formatting. Just paste the raw text. Our extraction engine will automatically identify required and preferred skills.
                </p>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="text-center mt-12 mb-8">
            <button
              onClick={handleAnalysis}
              disabled={isAnalyzing || !resumeText.trim() || !jobDescription.trim()}
              className={`btn-primary text-lg px-12 py-4 ${
                (!resumeText.trim() || !jobDescription.trim()) ? '' : 'hover:scale-105 shadow-xl shadow-brand-500/20'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin mr-3" />
                  <span>Processing Intelligence...</span>
                </>
              ) : (
                <>
                  <span>Analyze Alignment</span>
                  <ArrowRight className="w-6 h-6 ml-3" />
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default AnalysisPage;