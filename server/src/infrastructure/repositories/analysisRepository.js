const Analysis = require('../db/models/Analysis');
const { findOwnedById, isObjectId } = require('./ownership');

// History rows never load the full result or AI output.
const SUMMARY_PROJECTION = { result: 0, ai: 0, userId: 0, __v: 0 };

/** Persistence for analyses. Every read is scoped to the owning user. */
function createAnalysisRepository({ model = Analysis } = {}) {
  return {
    /** @returns {Promise<{ _id, createdAt }>} identity of the stored analysis */
    async create(analysis) {
      const created = await model.create(analysis);
      return { _id: created._id, createdAt: created.createdAt };
    },

    /** The analysis, or null if it does not exist or belongs to someone else. */
    findOwned({ userId, id }) {
      return findOwnedById(model, { userId, id, projection: { userId: 0, __v: 0 } });
    },

    /** Up to `limit` summaries, newest first, strictly older than `cursor` when given. */
    async listOwned({ userId, limit, cursor = null }) {
      if (!isObjectId(userId)) return [];
      const filter = { userId };
      if (cursor) filter._id = { $lt: cursor };
      return model.find(filter, SUMMARY_PROJECTION).sort({ _id: -1 }).limit(limit).lean();
    },

    /** Stores one completed AI task result on the caller's analysis, replacing any earlier result for that task. */
    async saveAiResult({ userId, id, result }) {
      if (!isObjectId(id) || !isObjectId(userId)) return false;
      const { matchedCount } = await model.updateOne({ _id: id, userId }, { $set: { [`ai.${result.task}`]: result } });
      return matchedCount === 1;
    },

    /** Deletes the caller's analysis. @returns {Promise<boolean>} false if it does not exist or is not owned */
    async deleteOwned({ userId, id }) {
      if (!isObjectId(id) || !isObjectId(userId)) return false;
      const { deletedCount } = await model.deleteOne({ _id: id, userId });
      return deletedCount === 1;
    },
  };
}

module.exports = { createAnalysisRepository };
