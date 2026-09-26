class EvidenceEngineV2 {
  /**
   * Generates structured evidence records from jd requirements and matcher evidence.
   */
  generateEvidence(jdRequirements = [], matcherEvidence = [], intelligenceContext = {}) {
    const evidenceRecords = [];

    const hierarchy = {
      'experience': 7,
      'projects': 6,
      'certifications': 5,
      'education': 4,
      'skills': 3,
      'summary': 2,
      'other': 1,
      'none': 0
    };

    for (const req of jdRequirements) {
      // Find all matches for this requirement
      const matches = matcherEvidence.filter(m => m.requirementCanonical === req.canonical);
      
      let bestMatch = null;
      let highestStrength = 0;

      for (const m of matches) {
        if (m.matchType === 'missing') continue;
        
        const section = m.resumeSection || 'other';
        const strength = hierarchy[section] || 0;

        if (strength > highestStrength) {
          highestStrength = strength;
          bestMatch = m;
        }
      }

      let status = 'MISSING';
      let matchType = 'missing';
      let evidenceStrength = 'none';
      let resumeEvidence = null;
      let confidence = 0;

      if (bestMatch) {
        matchType = bestMatch.matchType;
        evidenceStrength = bestMatch.resumeSection || 'other';
        resumeEvidence = {
          text: bestMatch.resumeEvidence || '',
          section: evidenceStrength,
          sourceId: bestMatch.sourceId || null,
          sourceType: bestMatch.sourceType || null
        };
        confidence = 100;
        status = 'MATCHED';
      }

      // Context overrides from intelligence analyzers (ExperienceAnalyzer, Education, etc.)
      // e.g. partial experience duration
      if (status === 'MATCHED' && req.category === 'experience' && intelligenceContext.experience) {
        const expIntel = intelligenceContext.experience.find(e => e.canonicalSkill === req.canonical);
        if (expIntel && expIntel.durationStatus === 'partial') {
          status = 'PARTIAL';
        } else if (expIntel && expIntel.durationStatus === 'missing') {
          // It matched text but didn't satisfy required duration?
          // If duration is explicitly missing while required, it's partial or missing depending on context.
          // Let's rely on KnockoutAnalyzer for strict gating.
        }
      }

      if (req.category === 'education' && intelligenceContext.education) {
        const eduIntel = intelligenceContext.education.find(e => e.canonicalReq === req.canonical);
        if (eduIntel && eduIntel.status === 'missing') {
           status = 'MISSING';
           matchType = 'missing';
           evidenceStrength = 'none';
           resumeEvidence = null;
        }
      }
      
      if (req.category === 'certification' && intelligenceContext.certification) {
        const certIntel = intelligenceContext.certification.find(e => e.canonicalReq === req.canonical);
        if (certIntel && certIntel.status === 'missing') {
           status = 'MISSING';
           matchType = 'missing';
           evidenceStrength = 'none';
           resumeEvidence = null;
        }
      }

      evidenceRecords.push({
        requirementId: req.id || `req-${Math.random().toString(36).substr(2,9)}`,
        requirement: req.skill || req.name || req.originalText || req.canonical,
        required: req.required === true,
        category: req.category || 'skill',
        canonical: req.canonical,
        originalRequirement: req.originalText,
        resumeEvidence,
        matchType,
        evidenceStrength,
        confidence,
        status
      });
    }

    return evidenceRecords;
  }
}

module.exports = new EvidenceEngineV2();
