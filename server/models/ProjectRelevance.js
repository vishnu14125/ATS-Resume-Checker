const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProjectRelevanceSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  resumeId: { type: Schema.Types.ObjectId, ref: 'Resume', required: true, index: true },
  
  projects: [{
    projectName: { type: String, required: true },
    technologies: [{ type: String }],
    demonstratedCapabilities: [{ type: String }],
    relevantRequirements: [{ type: String }],
    matchingSkills: [{ type: String }],
    missingInformation: [{ type: String }],
    relevanceExplanation: { type: String },
    resumeEmphasisSuggestion: { type: String }
  }],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ProjectRelevanceSchema.index({ resumeId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('ProjectRelevance', ProjectRelevanceSchema);
