/**
 * Skill recognition for resume and JD parsing.
 *
 * As of Phase 4 this delegates to the canonical taxonomy
 * (src/engine/taxonomy). The Phase 2 placeholder dictionary has been replaced;
 * the `recognize` / `displayForSkill` interface is unchanged so the Phase 2/3
 * parsers continue to work without modification.
 */
const { recognize, displayForSkill } = require('../taxonomy/taxonomy');

module.exports = { recognize, displayForSkill };
