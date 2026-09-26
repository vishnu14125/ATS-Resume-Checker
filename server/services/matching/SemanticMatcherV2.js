const EmbeddingService = require('../ai/EmbeddingService');
const skillTaxonomy = require('../taxonomy/skillTaxonomy');

class SemanticMatcherV2 {
  constructor() {
    this.SEMANTIC_MATCH_THRESHOLD = 0.85;
    this.SEMANTIC_REVIEW_THRESHOLD = 0.75;
    this.embeddingCache = new Map();
  }

  /**
   * Generates embeddings with a simple memory cache to prevent redundant model calls.
   */
  async _getEmbedding(text) {
    if (!text) return null;
    const normalized = text.toLowerCase().trim();
    if (this.embeddingCache.has(normalized)) {
      return this.embeddingCache.get(normalized);
    }
    try {
      // Force local provider to avoid external calls during V2
      EmbeddingService.providerType = 'local';
      const vector = await EmbeddingService.generateEmbedding(normalized);
      this.embeddingCache.set(normalized, vector);
      return vector;
    } catch (error) {
      console.warn(`[SemanticMatcherV2] Failed to generate embedding for "${normalized}": ${error.message}`);
      return null;
    }
  }

  /**
   * Clears the cache to prevent unbounded memory growth between large analysis runs.
   */
  clearCache() {
    this.embeddingCache.clear();
  }

  /**
   * Evaluates unresolved requirements against available resume sentences/tokens.
   * @param {Array} missingRequirements - Canonical strings of requirements that were NOT matched by exact/alias.
   * @param {Object} resumeProfile - Extracted V2 resume profile containing skills, experience descriptions, etc.
   * @returns {Array} Semantic candidates mapping
   */
  async match(missingRequirements = [], resumeProfile = {}) {
    const candidates = [];
    if (!missingRequirements || missingRequirements.length === 0) {
      return candidates;
    }

    // Prepare resume evidence targets (things we can compare against)
    const targets = this._extractResumeTargets(resumeProfile);
    if (targets.length === 0) return candidates;

    // Cache requirement embeddings
    const reqVectors = new Map();
    for (const req of missingRequirements) {
      const vec = await this._getEmbedding(req);
      if (vec) reqVectors.set(req, vec);
    }

    if (reqVectors.size === 0) {
      // Model unavailable or failed for all
      return candidates;
    }

    // Pre-embed targets if possible
    const targetVectors = new Map();
    for (const target of targets) {
      const vec = await this._getEmbedding(target.text);
      if (vec) targetVectors.set(target.text, vec);
    }

    // Now compare
    for (const req of missingRequirements) {
      const vecReq = reqVectors.get(req);
      if (!vecReq) continue;

      let bestMatch = null;
      let highestSimilarity = 0;

      for (const target of targets) {
        const vecTarget = targetVectors.get(target.text);
        if (!vecTarget) continue;

        const similarity = EmbeddingService.similarity(vecReq, vecTarget);
        if (similarity > highestSimilarity) {
          highestSimilarity = similarity;
          bestMatch = target;
        }
      }

      if (highestSimilarity > 0) {
        // Enforce anti-false-positive taxonomy knockout (e.g. Java vs Javascript)
        if (this._isTaxonomyKnockout(req, bestMatch.text)) {
           // Skip if it violates explicit taxonomy
           continue;
        }

        if (highestSimilarity >= this.SEMANTIC_MATCH_THRESHOLD) {
          candidates.push({
            requirementCanonical: req,
            resumeEvidence: bestMatch.originalText || bestMatch.text,
            resumeSection: bestMatch.section,
            similarity: Number(highestSimilarity.toFixed(4)),
            threshold: this.SEMANTIC_MATCH_THRESHOLD,
            matchType: "semantic",
            status: "MATCHED",
            reason: `Semantic similarity (${Number(highestSimilarity.toFixed(2))}) meets match threshold.`
          });
        } else if (highestSimilarity >= this.SEMANTIC_REVIEW_THRESHOLD) {
          candidates.push({
            requirementCanonical: req,
            resumeEvidence: bestMatch.originalText || bestMatch.text,
            resumeSection: bestMatch.section,
            similarity: Number(highestSimilarity.toFixed(4)),
            threshold: this.SEMANTIC_REVIEW_THRESHOLD,
            matchType: "semantic",
            status: "AMBIGUOUS",
            reason: `Semantic similarity (${Number(highestSimilarity.toFixed(2))}) is ambiguous and requires contextual validation.`
          });
        }
      }
    }

    return candidates;
  }

  _extractResumeTargets(resumeProfile) {
    const targets = [];
    
    // Explicit skills
    if (resumeProfile.skills) {
      for (const s of resumeProfile.skills) {
        targets.push({ text: s, originalText: s, section: 'skills' });
      }
    }

    // Experience descriptions (break by sentence or bullet to keep semantic meaning distinct)
    if (resumeProfile.experience) {
      for (const exp of resumeProfile.experience) {
        if (exp.description) {
          const sentences = exp.description.split(/(?<=[.!?])\s+/);
          for (const s of sentences) {
             if (s.trim().length > 5) {
               targets.push({ text: s.trim(), originalText: s.trim(), section: 'experience' });
             }
          }
        }
      }
    }
    
    // Project descriptions
    if (resumeProfile.projects) {
      for (const proj of resumeProfile.projects) {
        if (proj.description) {
           const sentences = proj.description.split(/(?<=[.!?])\s+/);
           for (const s of sentences) {
             if (s.trim().length > 5) {
                targets.push({ text: s.trim(), originalText: s.trim(), section: 'projects' });
             }
           }
        }
      }
    }

    return targets;
  }

  _isTaxonomyKnockout(reqCanonical, targetText) {
    const targetNorm = targetText.toLowerCase();
    
    // 1. Explicit anti-aliasing pairs (Java vs JavaScript, React vs React Native, etc)
    const knownConflicts = [
      ['java', 'javascript'],
      ['java', 'typescript'],
      ['react', 'react native'],
      ['bash', 'javascript'],
      ['c', 'c++'],
      ['c++', 'c#'],
      ['sql', 'nosql'],
      ['postgresql', 'mongodb'],
      ['python', 'pytorch'],
      ['aws', 'aws certified'],
      ['aws', 'aws certification']
    ];

    for (const pair of knownConflicts) {
      if ((reqCanonical === pair[0] && targetNorm.includes(pair[1])) ||
          (reqCanonical === pair[1] && targetNorm.includes(pair[0]))) {
         
         // If it explicitly contains the conflict word as an exact standalone concept, reject it.
         // e.g. req="java", target="i programmed in javascript". Reject.
         // BUT if target is "i programmed in java and javascript", we must be careful. 
         // Since we do exact matching BEFORE semantic matching, if the resume actually contained "java", 
         // it would have matched exactly and skipped semantic. Thus, it ONLY contains "javascript".
         return true;
      }
    }

    return false;
  }
}

module.exports = new SemanticMatcherV2();
