const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const InterviewPrepSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  resumeId: { type: Schema.Types.ObjectId, ref: 'Resume', required: true, index: true },
  
  questions: [{
    category: { type: String, enum: ['Technical', 'Resume-Based', 'Skill-Gap', 'Behavioral', 'Project'] },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'] },
    question: { type: String, required: true },
    evidence: { type: String }, // Relevant text from resume or JD
    reasoning: { type: String },
    preparationGuidance: { type: String },
    
    // User interaction states
    status: { type: String, enum: ['Unprepared', 'Prepared', 'Difficult'], default: 'Unprepared' }
  }],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

InterviewPrepSchema.index({ resumeId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('InterviewPrep', InterviewPrepSchema);
