/**
 * Version of the analysis engine as a whole: the composition of ingestion,
 * parsing, matching, evaluation, scoring and recommendations. Bump it whenever a
 * change to any stage can alter an AnalysisResult.
 */
const ENGINE_VERSION = '8.0.0-phase8';

module.exports = { ENGINE_VERSION };
