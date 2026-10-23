const crypto = require('crypto');

/**
 * Deterministic ids: the same content always yields the same id, so analyses are
 * reproducible and evidence references are stable. Never uses randomness.
 */
function makeId(prefix, ...parts) {
  const hash = crypto.createHash('sha256').update(parts.join('\u0001')).digest('hex').slice(0, 12);
  return `${prefix}_${hash}`;
}

module.exports = { makeId };
