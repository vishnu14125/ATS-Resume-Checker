class RecommendationEngineV2 {
  /**
   * Generates deterministic recommendations from evidence, knockouts, and parseability.
   */
  generateRecommendations(evidenceRecords = [], knockouts = [], parseabilityWarnings = []) {
    const recommendations = [];

    // Parseability Warnings -> Recommendations
    for (const w of parseabilityWarnings) {
      if (w.code === 'FATAL_TEXT_EXTRACTION') {
        recommendations.push({
          type: "parseability",
          priority: "critical",
          reason: w.message,
          action: "Use a standard, single-column text-based PDF or DOCX without complex graphics or tables."
        });
      } else if (w.code === 'EXTRACTION_NOISE') {
        recommendations.push({
          type: "parseability",
          priority: "medium",
          reason: w.message,
          action: "Ensure your resume font is standard and exports clean text rather than image-based layers."
        });
      } else if (w.code === 'MISSING_EMAIL') {
         recommendations.push({
          type: "parseability",
          priority: "high",
          reason: w.message,
          action: "Add a clear email address to your contact section."
        });
      } else {
        recommendations.push({
          type: "parseability",
          priority: "medium",
          reason: w.message,
          action: "Improve resume structure or formatting to ensure ATS parsers can read it."
        });
      }
    }

    // Knockouts -> Recommendations
    for (const ko of knockouts) {
      if (ko.status === 'MISSING') {
        recommendations.push({
          type: "skill_gap",
          priority: ko.severity === 'critical' ? 'high' : 'medium',
          requirement: ko.requirement,
          reason: ko.reason,
          action: `Add ${ko.requirement} experience only if you genuinely have experience using it.`
        });
      } else if (ko.status === 'PARTIAL') {
        recommendations.push({
          type: "experience_gap",
          priority: "high",
          requirement: ko.requirement,
          reason: ko.reason,
          action: `Highlight relevant ${ko.requirement} experience if additional qualifying experience exists.`
        });
      }
    }

    // Evidence Strength Recommendations (e.g. skills only)
    for (const record of evidenceRecords) {
      if (record.status === 'MATCHED' && record.evidenceStrength === 'skills') {
        recommendations.push({
          type: "evidence_strength",
          priority: "medium",
          requirement: record.requirement,
          reason: `${record.requirement} is listed but no experience/project evidence was detected.`,
          action: `If accurate, demonstrate ${record.requirement} usage in an experience or project bullet.`
        });
      }
    }

    // Deduplicate recommendations by reason
    const unique = [];
    const seenReasons = new Set();
    for (const r of recommendations) {
      if (!seenReasons.has(r.reason)) {
        seenReasons.add(r.reason);
        unique.push(r);
      }
    }

    return unique;
  }
}

module.exports = new RecommendationEngineV2();
