class KnockoutAnalyzerV2 {
  /**
   * Analyzes evidence records and intelligence contexts to detect critical missing knockouts.
   * Does NOT force overall score to 0, just yields knockout diagnostics.
   */
  analyze(evidenceRecords = [], intelligenceContext = {}) {
    const knockouts = [];

    for (const record of evidenceRecords) {
      if (!record.required) continue;

      if (record.status === 'MISSING') {
        let reason = `No explicit evidence was found for required ${record.category}: ${record.requirement}`;
        
        if (record.category === 'certification') {
            reason = `${record.requirement} is required. General experience is not equivalent to an explicit certification.`;
        } else if (record.category === 'education') {
            reason = `Explicit evidence of ${record.requirement} is missing. Student status or related experience cannot be inferred as a completed degree.`;
        }

        knockouts.push({
          requirement: record.requirement,
          reason,
          evidence: null,
          status: 'MISSING',
          severity: 'critical'
        });
      }

      if (record.status === 'PARTIAL' && record.category === 'experience') {
        const expIntel = intelligenceContext.experience ? intelligenceContext.experience.find(e => e.canonicalSkill === record.canonical) : null;
        let requiredMonths = 0;
        let demonstratedMonths = 0;
        
        if (expIntel) {
          requiredMonths = expIntel.requiredMonths;
          demonstratedMonths = expIntel.demonstratedMonths;
        }

        knockouts.push({
          requirement: record.requirement,
          requiredMonths,
          demonstratedMonths,
          reason: `Demonstrated experience (${demonstratedMonths} months) falls short of the minimum requirement (${requiredMonths} months).`,
          evidence: record.resumeEvidence ? record.resumeEvidence.text : null,
          status: 'PARTIAL',
          severity: 'high'
        });
      }
    }

    return knockouts;
  }
}

module.exports = new KnockoutAnalyzerV2();
