class ScoringEngine {
  /**
   * Methodology:
   * 1. Required Skills (40% weight): Pure coverage of absolute must-haves.
   * 2. Preferred Skills (15% weight): Bonus points for nice-to-haves.
   * 3. Experience Relevance (20% weight): Focuses on quantifiable achievements and measurable impact.
   * 4. Structure (15% weight): Presence of essential ATS-friendly sections (Contact, Summary, Exp, Edu).
   * 5. Keyword Coverage / Extras (10% weight): Additional context like Projects and Certifications.
   * 
   * Returns:
   * overallScore: 0-100
   * breakdown: detailed sub-scores (each 0-100) and evidence
   */
  calculateScore(resumeData, jdData, requiredMatches, preferredMatches) {
    let totalScore = 0;
    
    // 1. Required Skills Match (40% weight)
    const requiredTotal = (jdData.required?.skills?.length || 0) + (jdData.required?.technologies?.length || 0);
    const reqMatched = requiredMatches.strongMatches.length;
    const reqPartial = requiredMatches.partialMatches.length;
    
    let requiredScore = 100; // Perfect if no requirements
    if (requiredTotal > 0) {
      // partial counts for 0.5 match credit
      requiredScore = Math.min(((reqMatched + (reqPartial * 0.5)) / requiredTotal) * 100, 100);
    }
    totalScore += requiredScore * 0.40;

    // 2. Preferred Skills Match (15% weight)
    const prefTotal = (jdData.preferred?.skills?.length || 0) + (jdData.preferred?.technologies?.length || 0);
    const prefMatched = preferredMatches.strongMatches.length;
    const prefPartial = preferredMatches.partialMatches.length;

    let prefScore = 100; // Perfect if no preferences
    if (prefTotal > 0) {
      prefScore = Math.min(((prefMatched + (prefPartial * 0.5)) / prefTotal) * 100, 100);
    }
    totalScore += prefScore * 0.15;

    // 3. Structure & Completeness (15% weight)
    let structureScore = 0;
    if (resumeData.contact?.email) structureScore += 20;
    if (resumeData.contact?.phone) structureScore += 20;
    if (resumeData.summary && resumeData.summary.length > 20) structureScore += 20;
    if (resumeData.experience && resumeData.experience.length > 0) structureScore += 20;
    if (resumeData.education && resumeData.education.length > 0) structureScore += 20;
    structureScore = Math.min(structureScore, 100);
    totalScore += structureScore * 0.15;

    // 4. Experience Relevance & Achievements (20% weight)
    let expScore = 0;
    let totalAchievements = 0;
    if (resumeData.experience) {
      resumeData.experience.forEach(exp => {
        if (exp.achievements) totalAchievements += exp.achievements.length;
      });
      // Cap achievements at 5 for max score
      expScore = Math.min((totalAchievements / 5) * 100, 100);
      // Floor of 50 if they have experience but no achievements
      if (resumeData.experience.length > 0) {
        expScore = Math.max(expScore, 50); 
      }
    }
    totalScore += expScore * 0.20;

    // 5. Keyword Coverage / Extras in Projects / Certs (10% weight)
    let extraScore = 0;
    if (resumeData.projects && resumeData.projects.length > 0) extraScore += 50;
    if (resumeData.certifications && resumeData.certifications.length > 0) extraScore += 50;
    extraScore = Math.min(extraScore, 100);
    totalScore += extraScore * 0.10;

    return {
      overallScore: Math.round(totalScore),
      breakdown: {
        requiredSkills: {
          score: Math.round(requiredScore),
          evidence: `${reqMatched} strong, ${reqPartial} partial matches out of ${requiredTotal} required items.`
        },
        preferredSkills: {
          score: Math.round(prefScore),
          evidence: `${prefMatched} strong, ${prefPartial} partial matches out of ${prefTotal} preferred items.`
        },
        structure: {
          score: Math.round(structureScore),
          evidence: "Based on presence of essential sections: Contact, Summary, Experience, Education."
        },
        experience: {
          score: Math.round(expScore),
          evidence: `Detected ${totalAchievements} quantifiable achievements across roles.`
        },
        extras: {
          score: Math.round(extraScore),
          evidence: "Based on presence of Projects and Certifications sections."
        }
      }
    };
  }
}

module.exports = new ScoringEngine();
