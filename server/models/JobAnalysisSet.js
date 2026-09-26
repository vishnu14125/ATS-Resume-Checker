const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const JobAnalysisSetSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  resumeId: { type: Schema.Types.ObjectId, ref: 'Resume', required: true, index: true }, // The base resume used
  
  jobs: [{
    title: { type: String },
    company: { type: String },
    description: { type: String, required: true },
    structuredJD: { type: Schema.Types.Mixed },
    analysis: { type: Schema.Types.Mixed } // Stores the deterministic matching analysis
  }],
  
  aggregatedInsights: { type: Schema.Types.Mixed }, // Deterministic aggregation of skill gaps, recurring requirements
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('JobAnalysisSet', JobAnalysisSetSchema);
