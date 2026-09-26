const aiEngine = require('./ai/AIEngine');
const skillMatcher = require('./ai/SkillMatcher');
const scoringEngine = require('./ai/ScoringEngine');

const localATS = require('./LocalATSAnalyzer');

/**
 * Main Resume Analysis - Local First Pipeline
 */
async function analyzeResume(resumeText, jobDescription, fileName = 'Resume') {
  const correlationId = Math.random().toString(36).substring(2, 9) + '-' + Date.now();
  const v2Mode = process.env.ATS_V2_MODE || 'shadow';
  try {
    const startTime = Date.now();
    console.log(`[${correlationId}] 🚀 Starting ATS Analysis for ${fileName}... (Mode: ${v2Mode})`);

    let v2Result = null;
    let v2DurationMs = 0;
    
    if (v2Mode === 'v2' || v2Mode === 'shadow') {
      try {
        const v2Start = Date.now();
        v2Result = await require('./v2/ATSProductionAdapter').analyze(resumeText, jobDescription, fileName);
        v2DurationMs = Date.now() - v2Start;
        if (!v2Result.success) {
           console.warn(`[${correlationId}] ⚠️ V2 Pipeline Failed:`, v2Result.error);
           v2Result = null;
        } else if (v2Mode === 'v2') {
           console.log(`[${correlationId}] ✅ V2 Analysis completed in ${v2DurationMs}ms. Returning V2 result.`);
           v2Result.data.metadata = v2Result.data.metadata || {};
           v2Result.data.metadata.correlationId = correlationId;
           return v2Result.data;
        }
      } catch (v2Error) {
         console.warn(`[${correlationId}] ⚠️ V2 Pipeline Threw Error:`, v2Error);
         v2Result = null;
      }
    }

    // Step 1: Deterministic Local Extraction
    console.log(`[${correlationId}]   -> Executing local extraction...`);
    const structuredResume = localATS.parseResume(resumeText);
    const structuredJD = localATS.parseJobDescription(jobDescription);

    // Step 2: Local Skill Matching (Exact + Semantic if embeddings loaded)
    console.log(`[${correlationId}]   -> Performing local skill matching...`);
    const requiredMatches = await skillMatcher.matchSkills(
      [...(structuredJD.required.skills || []), ...(structuredJD.required.technologies || [])], 
      structuredResume
    );
    
    const preferredMatches = await skillMatcher.matchSkills(
      [...(structuredJD.preferred.skills || []), ...(structuredJD.preferred.technologies || [])], 
      structuredResume
    );

    // Step 3: Local Deterministic Scoring
    console.log(`[${correlationId}]   -> Calculating deterministic score...`);
    const scoreData = scoringEngine.calculateScore(
      structuredResume, 
      structuredJD, 
      requiredMatches, 
      preferredMatches
    );

    // Construct the baseline results immediately
    const missingRequired = requiredMatches.missing || [];
    const localRecommendations = localATS.generateLocalRecommendations(structuredResume, missingRequired);
    const localIssues = localATS.detectLocalIssues(structuredResume);

    const baselineData = {
      structuredResume,
      structuredJD,
      overallScore: scoreData.overallScore,
      scoreBreakdown: scoreData.breakdown,
      skillMatches: {
        strongMatches: [...requiredMatches.strongMatches, ...preferredMatches.strongMatches],
        partialMatches: [...requiredMatches.partialMatches, ...preferredMatches.partialMatches],
        missingRequired,
        missingPreferred: preferredMatches.missing || []
      },
      recommendations: localRecommendations,
      resumeIssues: localIssues,
      analysisMode: 'local_only',
      aiStatus: 'not_attempted',
      provider: 'none'
    };

    // Step 4: Optional AI Enhancement
    console.log(`[${correlationId}]   -> Attempting AI enhancement...`);
    try {
      // One single external call to enhance the baseline
      const enhancement = await aiEngine.enhanceAnalysis(baselineData);
      
      // Merge AI insights with local insights
      baselineData.recommendations = [...baselineData.recommendations, ...(enhancement.recommendations || [])];
      baselineData.resumeIssues = [...baselineData.resumeIssues, ...(enhancement.resumeIssues || [])];
      baselineData.analysisMode = 'enhanced';
      baselineData.aiStatus = 'success';
      baselineData.provider = aiEngine.provider ? aiEngine.provider.constructor.name : 'Unknown';
      console.log(`[${correlationId}]   -> AI enhancement successful.`);
    } catch (aiError) {
      console.warn(`[${correlationId}] ⚠️ AI enhancement skipped/failed. Falling back to local baseline. Reason: ${aiError.message}`);
      
      baselineData.analysisMode = 'local_only';
      baselineData.provider = 'none';
      
      if (aiError.status === 429) {
        baselineData.aiStatus = 'rate_limited';
      } else if (aiError.status >= 500 || aiError.message.includes('unavailable')) {
        baselineData.aiStatus = 'unavailable';
      } else if (aiError.message.includes('timeout')) {
        baselineData.aiStatus = 'timeout';
      } else if (aiError.message.includes('API key')) {
        baselineData.aiStatus = 'not_configured';
      } else {
        baselineData.aiStatus = 'failed';
      }
      
      // Do NOT throw the error. Return the baseline so the UI continues working.
    }

        const duration = Date.now() - startTime;
    console.log(`[${correlationId}] ✅ Analysis completed in ${duration}ms (Mode: ${baselineData.analysisMode})`);

    if (v2Mode === 'shadow' && v2Result) {
      console.log(`[${correlationId}] 🔍 SHADOW COMPARISON: V1 Score: ${baselineData.overallScore}, V2 Score: ${v2Result.data.matchScore}`);
      // Attach it to metadata for debugging (will be saved in DB if schema allows)
      baselineData.metadata = baselineData.metadata || {};
      v2Result.data.metadata = v2Result.data.metadata || {};
      baselineData.metadata.v2Comparison = {
        v1Score: baselineData.overallScore,
        v2MatchScore: v2Result.data.matchScore,
        v2ParseScore: v2Result.data.parseScore,
        v2Breakdown: v2Result.data.breakdown,
        v2EvidenceCount: (v2Result.data.evidence || []).length,
        v2KnockoutCount: (v2Result.data.knockouts || []).length,
        v2RecommendationCount: (v2Result.data.recommendations || []).length,
        v2AnalysisVersion: "2.1.0"
      };
    }

    let md = {
      provider: baselineData.provider,
      model: aiEngine.provider ? aiEngine.provider.modelName : 'none',
      analysisDuration: duration,
      timestamp: new Date(),
      correlationId,
      analysisMode: baselineData.analysisMode,
      aiStatus: baselineData.aiStatus
    };

    if (baselineData.metadata && baselineData.metadata.v2Comparison) { md.v2Comparison = baselineData.metadata.v2Comparison; } baselineData.metadata = md; return baselineData;

  } catch (error) {
    console.error(`[${correlationId}] ❌ Analysis Pipeline Error:`, error);
    // If we fail here, the local ATS crashed, which is a true 500 error
    const newError = new Error('Failed to analyze resume locally: ' + error.message);
    newError.statusCode = 500;
    throw newError;
  }
}

module.exports = {
  analyzeResume
};
