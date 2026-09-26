class EducationAnalyzerV2 {
  constructor() {
    this.degreeMap = {
      "bachelors": ["bachelor", "bachelors", "bs", "ba", "b.s", "b.a", "b.tech", "btech", "bsc"],
      "masters": ["master", "masters", "ms", "ma", "m.s", "m.a", "m.tech", "mtech", "msc", "m.sc", "mba"],
      "phd": ["phd", "ph.d", "doctorate"]
    };
  }

  analyze(resumeProfile, jdProfile) {
    const jdRequirements = this._parseJDEducation(jdProfile);
    const resumeEducation = resumeProfile.education || [];

    const assessment = [];
    
    for (const req of jdRequirements) {
      let matched = false;
      let evidence = null;
      
      const reqCanonical = this._getCanonicalDegree(req.degree);

      for (const edu of resumeEducation) {
        const text = (edu.degree || edu.originalText || "").toLowerCase();
        
        let hasDegree = false;
        
        if (reqCanonical) {
           const aliases = this.degreeMap[reqCanonical] || [reqCanonical];
           hasDegree = aliases.some(alias => {
             const escaped = alias.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
             return new RegExp('(^|[^a-zA-Z0-9_])' + escaped + '([^a-zA-Z0-9_]|$)', 'i').test(text);
           });
        } else {
           const escaped = req.degree.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
           hasDegree = new RegExp('(^|[^a-zA-Z0-9_])' + escaped + '([^a-zA-Z0-9_]|$)', 'i').test(text);
        }

        if (hasDegree) {
          matched = true;
          evidence = edu.originalText;
          break;
        }
      }

      assessment.push({
        requirement: req.degree,
        status: matched ? "meets" : "missing",
        evidence: evidence
      });
    }

    return { jdRequirements, assessment };
  }

  _getCanonicalDegree(degreeText) {
    const text = degreeText.toLowerCase();
    for (const [canonical, aliases] of Object.entries(this.degreeMap)) {
      if (aliases.some(a => {
        const escaped = a.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
        return new RegExp('(^|[^a-zA-Z0-9_])' + escaped + '([^a-zA-Z0-9_]|$)', 'i').test(text);
      })) {
        return canonical;
      }
    }
    return null;
  }

  _parseJDEducation(jdProfile) {
    const reqs = [];
    const text = (jdProfile.rawText || '').toLowerCase();
    
    if (text.includes('bachelor') || text.includes('b.s') || text.includes('b.a') || text.includes('bs degree')) {
      reqs.push({ degree: 'bachelors', classification: 'required' });
    }
    if (text.includes('master') || text.includes('m.s') || text.includes('ms degree')) {
      reqs.push({ degree: 'masters', classification: 'required' });
    }
    if (text.includes('phd') || text.includes('doctorate')) {
      reqs.push({ degree: 'phd', classification: 'required' });
    }
    
    const uniqueReqs = [];
    for (const r of reqs) {
       if (!uniqueReqs.some(u => u.degree === r.degree)) {
         uniqueReqs.push(r);
       }
    }

    return uniqueReqs;
  }
}

module.exports = new EducationAnalyzerV2();
