const mongoose = require('mongoose');

/**
 * Ownership-scoped lookups. Every read of a user-owned document goes through
 * a query that includes the owner's id, so another user's id and a
 * non-existent id are indistinguishable to the caller (both → null → 404).
 */

function isObjectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) && mongoose.isValidObjectId(value);
}

/**
 * @param {import('mongoose').Model} Model  a model whose documents carry `ownerField`
 * @param {{ userId: string, id: string, projection?: object, ownerField?: string }} query
 * @returns {Promise<object|null>} the document, or null if it does not exist or is not owned
 */
async function findOwnedById(Model, { userId, id, projection, ownerField = 'userId' }) {
  if (!isObjectId(id) || !isObjectId(userId)) return null;
  return Model.findOne({ _id: id, [ownerField]: userId }, projection).lean();
}

module.exports = { findOwnedById, isObjectId };
