class ProjectAnalyzerV2 {
  analyze(resumeProfile, jdProfile, matches) {
    const projectEvidence = [];
    
    if (!resumeProfile.projects || !Array.isArray(resumeProfile.projects)) {
      return { projectEvidence };
    }

    for (const proj of resumeProfile.projects) {
      // Look for matches mapped to this project description
      const relevantMatches = matches.filter(m => m.matchType !== 'missing' && m.resumeSection === 'project' && m.resumeEvidence && m.resumeEvidence.includes(proj.description || proj.originalText));
      const relevantSkills = [...new Set(relevantMatches.map(m => m.requirementCanonical))];

      if (relevantSkills.length > 0) {
        projectEvidence.push({
          title: proj.title || "Unknown Project",
          description: proj.description || proj.originalText || "",
          matchedRequirements: relevantMatches,
          relevantSkills
        });
      }
    }

    return { projectEvidence };
  }
}

module.exports = new ProjectAnalyzerV2();
