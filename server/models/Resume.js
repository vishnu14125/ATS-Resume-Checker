 
const mongoose = require('mongoose');
const { Schema } = mongoose;

const resumeSchema = new Schema({
  name: { type: String, default: 'Unknown' },
  gender: { type: String, default: 'unknown' },
  location: { type: String, default: 'unspecified' },
  originalText: { type: String, required: true },
  anonymizedText: { type: String },
  score: { type: Number, default: 0 },
  keywordsMatched: [String],
  keywordsMissing: [String],
  suggestions: { type: Schema.Types.Mixed },  // 👈 accept any object or string
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Resume', resumeSchema);
