import React from 'react';

const ScoreOverview = ({ score }) => {
  const getScoreClass = (s) => {
    if (s >= 80) return 'text-emerald-700 bg-emerald-50 border-emerald-500';
    if (s >= 60) return 'text-amber-700 bg-amber-50 border-amber-500';
    return 'text-rose-700 bg-rose-50 border-rose-500';
  };

  const getScoreLabel = (s) => {
    if (s >= 80) return 'Excellent Match';
    if (s >= 60) return 'Good Match';
    return 'Needs Improvement';
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12 text-center mb-8 flex flex-col md:flex-row items-center justify-center space-y-6 md:space-y-0 md:space-x-12">
      <div className={`flex items-center justify-center w-32 h-32 rounded-full border-8 text-5xl font-black shadow-inner ${getScoreClass(score)}`}>
        {score}
      </div>
      <div className="text-left">
        <h2 className="text-3xl font-extrabold text-slate-900 mb-2">
          {getScoreLabel(score)}
        </h2>
        <p className="text-lg font-medium text-slate-500">
          Overall ATS Compatibility Score
        </p>
      </div>
    </div>
  );
};

export default ScoreOverview;
