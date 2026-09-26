const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const LearningRoadmapSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  resumeId: { type: Schema.Types.ObjectId, ref: 'Resume', required: true, index: true },
  
  items: [{
    skill: { type: String, required: true },
    reason: { type: String },
    priority: { type: String, enum: ['Critical', 'Important', 'Nice-to-Have'] },
    currentEvidence: { type: String },
    targetRequirement: { type: String },
    prerequisites: [{ type: String }],
    suggestedSequence: [{ type: String }],
    effort: { type: String }
  }],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

LearningRoadmapSchema.index({ resumeId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('LearningRoadmap', LearningRoadmapSchema);
