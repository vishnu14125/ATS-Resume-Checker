const embeddingService = require('./EmbeddingService');

class SkillMatcher {
  /**
   * Normalizes a string to a common format (e.g., "Node.js" -> "node js", "ReactJS" -> "react js")
   */
  normalize(skill) {
    if (!skill) return "";
    let s = skill.toLowerCase().trim();
    // common substitutions
    s = s.replace(/\.js$/, ' js')
         .replace(/js$/, ' js')
         .replace(/\./g, '')
         .replace(/-/g, ' ')
         .replace(/\s+/g, ' ')
         .trim();
    return s;
  }

  /**
   * Compare JD skills against Resume skills/experience using hybrid approach
   */
  async matchSkills(jdSkills, resumeStructured) {
    // 1. Gather all resume evidence (skills + experience descriptions + projects)
    const resumeSkillSet = new Set(resumeStructured.skills.map(s => this.normalize(s)));
    
    // Build a flat evidence pool to search for context
    const evidencePool = [];
    
    resumeStructured.skills.forEach(s => evidencePool.push({ text: s, source: 'Skills Section' }));
    
    resumeStructured.experience.forEach(exp => {
      if (exp.technologies) {
        exp.technologies.forEach(t => evidencePool.push({ text: t, source: `Experience: ${exp.company}` }));
      }
      if (exp.description) {
        evidencePool.push({ text: exp.description, source: `Experience: ${exp.company}` });
      }
    });

    resumeStructured.projects.forEach(proj => {
      if (proj.technologies) {
        proj.technologies.forEach(t => evidencePool.push({ text: t, source: `Project: ${proj.name}` }));
      }
    });

    // 2. Pre-compute embeddings for evidence if needed
    // To save time, we might only embed if exact/normalized fails
    
    const results = {
      strongMatches: [],
      partialMatches: [],
      missing: [],
      uncertain: []
    };

    for (const jdSkill of jdSkills) {
      const normJd = this.normalize(jdSkill);
      
      // Layer 1 & 2: Exact & Normalized Match
      if (resumeSkillSet.has(normJd)) {
        results.strongMatches.push({
          skill: jdSkill,
          status: 'matched',
          resumeEvidence: 'Found in Skills section',
          jdEvidence: jdSkill,
          confidence: 1.0,
          matchType: 'exact'
        });
        continue;
      }

      // Check evidence pool for exact/normalized match
      let foundExact = null;
      for (const ev of evidencePool) {
        if (this.normalize(ev.text).includes(normJd)) {
          foundExact = ev;
          break;
        }
      }

      if (foundExact) {
        results.strongMatches.push({
          skill: jdSkill,
          status: 'matched',
          resumeEvidence: `Found in ${foundExact.source}: "${foundExact.text.substring(0, 100)}..."`,
          jdEvidence: jdSkill,
          confidence: 0.9,
          matchType: 'context'
        });
        continue;
      }

      // Layer 3: Semantic Match
      // (This requires calling the embedding service)
      try {
        const jdVec = await embeddingService.generateEmbedding(jdSkill);
        
        let bestMatch = { score: 0, text: null, source: null };
        
        // We only compare against explicit skills and short tech tags to save compute
        // instead of full descriptions, which might dilute the embedding
        const semanticCandidates = evidencePool.filter(e => e.text && e.text.length < 50);
        
        for (const candidate of semanticCandidates) {
          const candVec = await embeddingService.generateEmbedding(candidate.text);
          const score = embeddingService.similarity(jdVec, candVec);
          
          if (score > bestMatch.score) {
            bestMatch = { score, text: candidate.text, source: candidate.source };
          }
        }

        if (bestMatch.score >= 0.85) {
          results.strongMatches.push({
            skill: jdSkill,
            status: 'matched',
            resumeEvidence: `Semantic match with "${bestMatch.text}" in ${bestMatch.source}`,
            jdEvidence: jdSkill,
            confidence: bestMatch.score,
            matchType: 'semantic'
          });
        } else if (bestMatch.score >= 0.70) {
          results.partialMatches.push({
            jdSkill: jdSkill,
            resumeSkill: bestMatch.text,
            status: 'partial',
            resumeEvidence: `Partial match with "${bestMatch.text}" in ${bestMatch.source}`,
            jdEvidence: jdSkill,
            confidence: bestMatch.score,
            matchType: 'semantic'
          });
        } else {
          results.missing.push({
            skill: jdSkill,
            status: 'missing',
            resumeEvidence: 'No reliable evidence detected in the resume.',
            jdEvidence: jdSkill,
            confidence: 0,
            matchType: 'none'
          });
        }
      } catch (err) {
        console.error("Semantic match failed for " + jdSkill, err);
        results.uncertain.push({
          skill: jdSkill,
          status: 'uncertain',
          error: err.message
        });
      }
    }

    return results;
  }
}

module.exports = new SkillMatcher();
