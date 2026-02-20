const natural = require('natural');
const { extractKeywords, calculateSimilarity } = require('./nlpService');
const { validateResumeStructure } = require('./structureService');

/**
 * Main Resume Analysis (Base version - Commit 1)
 */
async function analyzeResume(resumeText, jobDescription, fileName = 'Resume') {
  try {
    console.log('🔍 Starting base resume analysis...');

    // Step 1: Extract keywords
    const resumeKeywords = await extractKeywords(resumeText);
    const jobKeywords = await extractKeywords(jobDescription);

    // Step 2: Calculate semantic similarity
    const similarityScore = await calculateSimilarity(resumeText, jobDescription);

    // Step 3: Analyze resume structure
    const structureAnalysis = validateResumeStructure(resumeText);

    // Step 4: Calculate keyword match score
    const keywordMatch = calculateKeywordMatch(resumeKeywords, jobKeywords);

    // Step 5: Calculate overall score
    const overallScore = calculateOverallScore({
      similarityScore,
      keywordMatch,
      structureAnalysis
    });

    return {
      overallScore: Math.round(overallScore),
      breakdown: {
        atsCompatibility: Math.round(structureAnalysis.score),
        keywordMatch: Math.round(keywordMatch.score),
        sectionCompleteness: Math.round(structureAnalysis.sectionScore),
        overallReadability: Math.round(similarityScore * 100)
      },
      keywordAnalysis: {
        matched: keywordMatch.matched,
        missing: keywordMatch.missing,
        resumeKeywords: resumeKeywords.slice(0, 20),
        jobKeywords: jobKeywords.slice(0, 20)
      },
      structureAnalysis: {
        sections: structureAnalysis.sections,
        issues: structureAnalysis.issues,
        recommendations: structureAnalysis.recommendations
      },
      metadata: {
        fileName,
        analysisDate: new Date().toISOString(),
        textLength: resumeText.length,
        wordCount: resumeText.split(/\s+/).length
      }
    };

  } catch (error) {
    console.error('Analysis service error:', error);
    throw new Error('Failed to analyze resume: ' + error.message);
  }
}

/**
 * Calculate keyword match between resume and job description
 */
function calculateKeywordMatch(resumeKeywords, jobKeywords) {
  const resumeSet = new Set(resumeKeywords.map(k => k.toLowerCase()));
  const jobSet = new Set(jobKeywords.map(k => k.toLowerCase()));

  const matched = jobKeywords.filter(keyword =>
    resumeSet.has(keyword.toLowerCase())
  );

  const missing = jobKeywords.filter(keyword =>
    !resumeSet.has(keyword.toLowerCase())
  );

  const score = (matched.length / jobKeywords.length) * 100;

  return {
    score: Math.min(score, 100),
    matched,
    missing,
    matchPercentage: Math.round((matched.length / jobKeywords.length) * 100)
  };
}

/**
 * Calculate overall score (base version without AI suggestions yet)
 */
function calculateOverallScore(components) {
  const weights = {
    atsCompatibility: 0.4,
    keywordMatch: 0.35,
    sectionCompleteness: 0.15,
    overallReadability: 0.10
  };

  const scores = {
    atsCompatibility: components.structureAnalysis.score,
    keywordMatch: components.keywordMatch.score,
    sectionCompleteness: components.structureAnalysis.sectionScore,
    overallReadability: components.similarityScore * 100
  };

  let totalScore = 0;
  for (const [component, weight] of Object.entries(weights)) {
    totalScore += scores[component] * weight;
  }

  return Math.min(totalScore, 100);
}

module.exports = {
  analyzeResume
};
