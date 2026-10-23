const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * A completed analysis owned by one user.
 *
 * `result` is the canonical AnalysisResult exactly as the engine produced and
 * validated it; the domain contract, not this schema, defines its shape. The
 * other fields are small, queryable metadata for ownership, history and
 * engine-version tracking.
 *
 * Deliberately not stored: the uploaded file, the full document text and the
 * parsed profiles. Documents are identified by a content hash; the only resume
 * text kept is the short evidence snippets inside `result`.
 */
const documentDescriptor = {
  kind: { type: String, enum: ['pdf', 'docx', 'txt', 'paste'], required: true },
  fileName: { type: String, default: null },
  sizeBytes: { type: Number, default: null },
  textHash: { type: String, required: true },
};

const analysisSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mode: { type: String, enum: ['resume_only', 'job_match'], required: true },
    resume: { type: new Schema(documentDescriptor, { _id: false }), required: true },
    job: {
      type: new Schema({ ...documentDescriptor, title: { type: String, default: null }, company: { type: String, default: null } }, { _id: false }),
      default: null,
    },
    summary: { type: Schema.Types.Mixed, required: true },
    versions: { type: Schema.Types.Mixed, required: true },
    result: { type: Schema.Types.Mixed, required: true },
    // Optional AI enrichment, keyed by task: validated, grounded AiTaskResults only.
    // Never raw model responses or prompts. Stored beside `result`, never inside it.
    ai: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  // minimize:false keeps empty objects inside `result`, so a stored result reads back contract-valid.
  { timestamps: true, minimize: false, collection: 'analyses' }
);

// History listing: one user's analyses, newest first (ObjectIds are creation-ordered).
analysisSchema.index({ userId: 1, _id: -1 });

module.exports = mongoose.models.Analysis || mongoose.model('Analysis', analysisSchema);
