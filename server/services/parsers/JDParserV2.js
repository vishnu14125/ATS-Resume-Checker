const { JDProfileSchema } = require('../schemas/v2Schemas');

class JDParserV2 {
  constructor() {
    this.techDictionary = ['react', 'node.js', 'javascript', 'python', 'java', 'sql', 'mongodb', 'docker', 'kubernetes', 'aws', 'typescript', 'express', 'css', 'html', 'git', 'c++', 'c#', 'angular', 'vue', 'react native', 'postgresql', 'postgres', 'pytorch'];
  }

  parse(text) {
    if (!text || typeof text !== 'string') {
      throw new Error("Invalid JD text");
    }

    const profile = {
      roleTitle: null,
      domain: null,
      seniority: null,
      minYearsExperience: null,
      requirements: [],
      responsibilities: []
    };

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Extract Title (usually first non-empty line)
    profile.roleTitle = lines[0];

    // Extract Years of Experience
    const expRegex = /(\d+)(?:\s*-\s*\d+)?\+?\s*(?:years? of experience|years? experience|yrs? exp)/i;
    for (const line of lines) {
      const match = line.match(expRegex);
      if (match) {
        profile.minYearsExperience = parseInt(match[1], 10);
        break; // take first match
      }
    }

    // Extract Requirements & Classification
    // Must, Required, Minimum, Mandatory vs Preferred, Bonus, Plus
    const requiredKeywords = ['must have', 'required', 'minimum', 'mandatory', 'essential', 'must'];
    const preferredKeywords = ['preferred', 'nice to have', 'bonus', 'plus', 'advantage'];

    // Split text into sentences/bullets for analysis
    const sentences = text.split(/(?<=[.!?])(?=\s+)|\n/).map(s => s.trim()).filter(s => s.length > 5);

    let currentSection = 'general';
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();

      // Section tracking (very naive for V2 baseline)
      if (sentence.length < 30 && !sentence.includes('-') && !sentence.includes('•')) {
        if (lower.includes('responsibilities') || lower.includes('what you will do')) {
          currentSection = 'responsibilities';
        } else if (lower.includes('requirements') || lower.includes('qualifications')) {
          currentSection = 'requirements';
        } else if (lower.includes('nice to have') || lower.includes('preferred')) {
          currentSection = 'preferred';
        }
      }

      if (currentSection === 'responsibilities' && sentence.startsWith('•')) {
        profile.responsibilities.push(sentence);
      }

      // Check for tech keywords in sentence
      for (const tech of this.techDictionary) {
        const escapedTech = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escapedTech}([^a-zA-Z0-9_]|$)`, 'i');
        if (regex.test(lower)) {
          let classification = 'nice_to_have'; // default
          let qualifier = null;

          if (currentSection === 'requirements') {
            classification = 'required';
            qualifier = 'section heading';
          } else if (currentSection === 'preferred') {
            classification = 'preferred';
            qualifier = 'section heading';
          }

          // Check sentence-level qualifiers
          for (const word of requiredKeywords) {
            if (lower.includes(word)) {
              classification = 'required';
              qualifier = word;
              break;
            }
          }
          if (classification !== 'required') {
            for (const word of preferredKeywords) {
              if (lower.includes(word)) {
                classification = 'preferred';
                qualifier = word;
                break;
              }
            }
          }

          profile.requirements.push({
            canonical: tech.replace('.js', '').replace(/\s+/g, ''),
            original: tech,
            classification: classification,
            qualifier: qualifier,
            evidence: sentence
          });
        }
      }
    }

    // Deduplicate requirements (keep the strictest classification if duplicates exist)
    const uniqueReqs = new Map();
    for (const req of profile.requirements) {
      if (uniqueReqs.has(req.canonical)) {
        const existing = uniqueReqs.get(req.canonical);
        if (req.classification === 'required' && existing.classification !== 'required') {
          uniqueReqs.set(req.canonical, req); // Upgrade to required
        }
      } else {
        uniqueReqs.set(req.canonical, req);
      }
    }
    profile.requirements = Array.from(uniqueReqs.values());

    return profile;
  }
}

module.exports = new JDParserV2();
