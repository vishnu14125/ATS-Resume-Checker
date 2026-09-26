const taxonomyService = require('../taxonomy/skillTaxonomy');
const SemanticMatcherV2 = require('./SemanticMatcherV2');

class MatcherV2 {
  /**
   * Evaluates ResumeProfile against JDProfile to produce MatchEvidence array.
   */
  async match(resumeProfile, jdProfile) {
    if (!resumeProfile || !jdProfile) {
      throw new Error("resumeProfile and jdProfile are required");
    }

    const matches = [];
    const missingRequirements = []; // Used to collect unresolved requirements for semantic matching

    // Extract all evidence from the resume into a unified structure
    const allEvidence = this._aggregateResumeEvidence(resumeProfile);

    // Track which JD requirements we have evaluated
    const evaluatedReqs = new Set();

    for (const req of jdProfile.requirements) {
      // Deduplicate requirements by canonical just in case
      const reqCanonical = taxonomyService.resolveCanonical(req.canonical || req.original);
      
      if (evaluatedReqs.has(reqCanonical)) continue;
      evaluatedReqs.add(reqCanonical);

      // 1. EXACT / NORMALIZED MATCH
      const foundEvidences = allEvidence.filter(ev => {
        const evCanonical = taxonomyService.resolveCanonical(ev.canonical || ev.original);
        return evCanonical === reqCanonical;
      });

      if (foundEvidences.length > 0) {
        // Deduplicate the evidence texts themselves so we don't return the same sentence twice
        const uniqueEvidences = this._deduplicateEvidence(foundEvidences);
        
        // Find the strongest evidence type for the 'resumeSection' and 'resumeEvidence' fields
        const strongest = this._getStrongestEvidence(uniqueEvidences);

        matches.push({
          requirementCanonical: reqCanonical,
          requirementClassification: req.classification,
          matchType: req.original.toLowerCase() === strongest.original.toLowerCase() ? 'exact' : (req.original.replace(/\\W/g, '').toLowerCase() === strongest.original.replace(/\\W/g, '').toLowerCase() ? 'normalized' : 'alias'),
          confidence: 1.0,
          resumeSection: strongest.section,
          resumeEvidence: strongest.evidence,
          resumeText: strongest.original,
          evidenceType: strongest.evidenceType,
          allResumeEvidences: uniqueEvidences // keeping full context for future use
        });
      } else {
        // Did not match explicitly, save for semantic match fallback
        missingRequirements.push(reqCanonical);
        
        matches.push({
          requirementCanonical: reqCanonical,
          requirementClassification: req.classification,
          matchType: 'missing', // initially missing, may be overridden by semantic
          confidence: 1.0,
          resumeSection: null,
          resumeEvidence: null,
          resumeText: null,
          evidenceType: null,
          allResumeEvidences: []
        });
      }
    }

    // 2. SEMANTIC MATCH FALLBACK
    if (missingRequirements.length > 0) {
      const semanticCandidates = await SemanticMatcherV2.match(missingRequirements, resumeProfile);
      
      for (const candidate of semanticCandidates) {
         if (candidate.status === 'MATCHED') {
            // Find and update the corresponding missing match record
            const matchRecord = matches.find(m => m.requirementCanonical === candidate.requirementCanonical);
            if (matchRecord && matchRecord.matchType === 'missing') {
               matchRecord.matchType = 'semantic';
               matchRecord.resumeSection = candidate.resumeSection;
               matchRecord.resumeEvidence = candidate.resumeEvidence;
               matchRecord.resumeText = candidate.resumeEvidence;
               // Include similarity as a diagnostic extension point
               matchRecord.similarity = candidate.similarity;
            }
         }
      }
    }

    return matches;
  }

  /**
   * Aggregates all skills from experience, projects, education, certs, and generic skills list.
   * Ensures that evidence location is preserved.
   */
  _aggregateResumeEvidence(profile) {
    const evidences = [];

    // 1. Generic Skills
    if (profile.allSkills) {
      for (const sk of profile.allSkills) {
        evidences.push({ ...sk, section: sk.section || 'skills', evidenceStrength: 1 });
      }
    }

    // 2. Experience Skills
    if (profile.experience) {
      for (const exp of profile.experience) {
        if (exp.skills) {
          for (const sk of exp.skills) {
            evidences.push({ ...sk, section: 'experience', evidenceStrength: 5 });
          }
        }
      }
    }

    // 3. Project Skills
    if (profile.projects) {
      for (const proj of profile.projects) {
        if (proj.skills) {
          for (const sk of proj.skills) {
            evidences.push({ ...sk, section: 'project', evidenceStrength: 4 });
          }
        }
      }
    }

    return evidences;
  }

  /**
   * Removes duplicate evidence objects (same sentence / canonical).
   */
  _deduplicateEvidence(evidences) {
    const unique = new Map();
    for (const ev of evidences) {
      const key = `${ev.canonical}-${ev.evidence}`;
      if (!unique.has(key)) {
        unique.set(key, ev);
      } else {
        // Keep the one with higher strength if duplicate sentence found in different contexts
        if ((ev.evidenceStrength || 0) > (unique.get(key).evidenceStrength || 0)) {
          unique.set(key, ev);
        }
      }
    }
    return Array.from(unique.values());
  }

  /**
   * Selects the 'best' single piece of evidence to represent the match.
   * Order of preference: experience > project > certification > education > skills > summary > other
   */
  _getStrongestEvidence(evidences) {
    if (evidences.length === 0) return null;
    
    // Sort descending by evidenceStrength
    const sorted = [...evidences].sort((a, b) => {
      const strengthA = a.evidenceStrength || 0;
      const strengthB = b.evidenceStrength || 0;
      return strengthB - strengthA;
    });

    return sorted[0];
  }
}

module.exports = new MatcherV2();
