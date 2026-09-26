import React from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import toast from 'react-hot-toast';

const ResultsHeader = ({ navigate, resumeId }) => {
  const handleExport = async () => {
    try {
      if (!resumeId) {
        toast.error('Resume ID not found');
        return;
      }
      const response = await fetch(`/api/export/${resumeId}`);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `ATS_Resume_Report.pdf`;
      link.click();
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download report');
    }
  };

  return (
    <div className="flex items-center justify-between mb-8">
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center space-x-2 text-slate-600 hover:text-sky-600 transition-colors font-semibold"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Dashboard</span>
      </button>
      <button 
        onClick={handleExport} 
        className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-4 py-2 rounded-lg font-bold flex items-center space-x-2 transition-colors shadow-sm"
      >
        <Download className="w-4 h-4" />
        <span>Export Report</span>
      </button>
    </div>
  );
};

export default ResultsHeader;
