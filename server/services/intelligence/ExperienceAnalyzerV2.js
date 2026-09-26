const skillTaxonomy = require('../taxonomy/skillTaxonomy');

class ExperienceAnalyzerV2 {
  constructor() {
    this.monthsMap = {
      jan: 1, january: 1,
      feb: 2, february: 2,
      mar: 3, march: 3,
      apr: 4, april: 4,
      may: 5,
      jun: 6, june: 6,
      jul: 7, july: 7,
      aug: 8, august: 8,
      sep: 9, sept: 9, september: 9,
      oct: 10, october: 10,
      nov: 11, november: 11,
      dec: 12, december: 12
    };
  }

  analyze(resumeProfile, jdProfile, matches, referenceDate = new Date()) {
    const jdRequirements = this._parseJDRequirements(jdProfile);
    const parsedExperiences = this._parseResumeExperiences(resumeProfile, referenceDate);
    
    const experienceEvidence = [];

    for (const exp of parsedExperiences) {
      const relevantMatches = matches.filter(m => m.resumeSection === 'experience' && m.resumeEvidence && m.resumeEvidence.includes(exp.originalText));
      const relevantSkills = [...new Set(relevantMatches.map(m => m.requirementCanonical))];

      experienceEvidence.push({
        title: exp.title,
        company: exp.company,
        startDate: exp.startDate,
        endDate: exp.endDate,
        durationMonths: exp.durationMonths,
        isCurrent: exp.isCurrent,
        datePrecision: exp.datePrecision,
        evidence: exp.originalText,
        matchedRequirements: relevantMatches,
        relevantSkills
      });
    }

    const assessment = this._assessRequirements(jdRequirements, experienceEvidence);

    return {
      experienceEvidence,
      jdRequirements,
      assessment
    };
  }

  _parseJDRequirements(jdProfile) {
    const reqs = [];
    const text = jdProfile.rawText || '';
    
    // Use a global regex to catch multiple requirements on the same line
    const yearsRegex = /(\d+)\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+experience)?(?:\s+(?:in|with|using))?\s+([a-zA-Z0-9\.\#\+\s]+?)(?=\s+and|\s*,|\.|$|\s+\d+\+?\s+years?)/gi;
    
    let match;
    while ((match = yearsRegex.exec(text)) !== null) {
      const years = parseInt(match[1], 10);
      const skillText = match[2].trim().toLowerCase();
      
      let canonicalSkill = null;
      for (const word of skillText.split(/[\s,]+/) ) {
         const canon = skillTaxonomy.resolveCanonical(word);
         if (canon !== word || skillTaxonomy.aliasMap.has(word)) {
            canonicalSkill = canon;
            break;
         }
      }
      
      reqs.push({
        requirementType: "years",
        canonicalSkill: canonicalSkill || skillText.split(' ')[0],
        requiredMonths: years * 12,
        classification: "required",
        evidence: match[0].trim()
      });
    }

    // Deduplicate requirements for the same skill, keeping the max required months
    const deduplicated = [];
    for (const req of reqs) {
      const existing = deduplicated.find(d => d.canonicalSkill === req.canonicalSkill);
      if (existing) {
        if (req.requiredMonths > existing.requiredMonths) {
          existing.requiredMonths = req.requiredMonths;
          existing.evidence = req.evidence;
        }
      } else {
        deduplicated.push(req);
      }
    }
    
    return deduplicated;
  }

  _parseDateString(dateStr, referenceDate) {
    if (!dateStr || dateStr.toLowerCase().includes('present') || dateStr.toLowerCase().includes('current') || dateStr.toLowerCase().includes('now')) {
      return { year: referenceDate.getFullYear(), month: referenceDate.getMonth() + 1, precision: 'month', isCurrent: true };
    }

    let str = dateStr.toLowerCase().trim();
    
    // MM/YYYY
    const mmYyyyMatch = str.match(/(?:^|\D)(\d{1,2})\s*\/\s*(\d{4})(?:\D|$)/);
    if (mmYyyyMatch) {
      const m = parseInt(mmYyyyMatch[1], 10);
      const y = parseInt(mmYyyyMatch[2], 10);
      if (m >= 1 && m <= 12) return { year: y, month: m, precision: 'month', isCurrent: false };
    }

    // Month YYYY
    const monthYyyyMatch = str.match(/([a-z]+)\s+(\d{4})/);
    if (monthYyyyMatch) {
      const monthWord = monthYyyyMatch[1];
      const monthNum = this.monthsMap[monthWord];
      if (monthNum) {
        return { year: parseInt(monthYyyyMatch[2], 10), month: monthNum, precision: 'month', isCurrent: false };
      }
    }

    // YYYY
    const yyyyMatch = str.match(/(?:^|\D)(\d{4})(?:\D|$)/);
    if (yyyyMatch) {
      return { year: parseInt(yyyyMatch[1], 10), month: 1, precision: 'year', isCurrent: false };
    }

    return { year: null, month: null, precision: 'unknown', isCurrent: false };
  }

  _calculateDuration(start, end, referenceDate) {
    if (!start.year || !end.year) return 0;

    let startTotal = start.year * 12 + (start.month || 1);
    let endTotal = end.year * 12 + (end.month || 1);
    
    if (endTotal < startTotal) return 0; // End before start
    
    const refTotal = referenceDate.getFullYear() * 12 + (referenceDate.getMonth() + 1);
    if (startTotal > refTotal) return 0; // Future start date
    
    if (endTotal > refTotal) endTotal = refTotal; // Cap end date to reference date if it's in the future

    let months = endTotal - startTotal;
    
    return months >= 0 ? months : 0;
  }

  _parseResumeExperiences(resumeProfile, referenceDate) {
    const experiences = [];
    if (!resumeProfile.experience || !Array.isArray(resumeProfile.experience)) return experiences;

    for (const exp of resumeProfile.experience) {
      const title = exp.title || "Unknown Title";
      const company = exp.company || "Unknown Company";
      const dateStr = exp.dates || "";
      
      let startDateStr = "";
      let endDateStr = "";
      
      const parts = dateStr.split('-');
      if (parts.length >= 2) {
        startDateStr = parts[0].trim();
        endDateStr = parts.slice(1).join('-').trim(); // Take the rest as end date
      } else {
        startDateStr = dateStr;
      }

      const start = this._parseDateString(startDateStr, referenceDate);
      let end = this._parseDateString(endDateStr, referenceDate);

      let durationMonths = 0;
      let datePrecision = 'unknown';

      if (start.precision !== 'unknown') {
        if (!endDateStr) {
           end = start;
        }
        
        // Prevent end before start or future dates by doing it inside calculation
        durationMonths = this._calculateDuration(start, end, referenceDate);
        datePrecision = start.precision === 'month' && end.precision === 'month' ? 'month' : 'year';
        
        if (durationMonths === 0 && start.precision !== 'unknown') {
          // If start and end are exactly the same month, we count it as 1 month.
          // Unless it was rejected due to being in the future.
          const refTotal = referenceDate.getFullYear() * 12 + (referenceDate.getMonth() + 1);
          const startTotal = start.year * 12 + (start.month || 1);
          const endTotal = end.year * 12 + (end.month || 1);
          if (startTotal <= refTotal && endTotal >= startTotal) {
            durationMonths = 1; 
          }
        }
      }

      experiences.push({
        title,
        company,
        startDate: start.year ? `${start.year}-${String(start.month || 1).padStart(2, '0')}` : null,
        endDate: end.year ? `${end.year}-${String(end.month || 1).padStart(2, '0')}` : null,
        durationMonths,
        isCurrent: end.isCurrent,
        datePrecision,
        originalText: exp.description || exp.originalText || ""
      });
    }

    return experiences;
  }

  _assessRequirements(jdReqs, experienceEvidence) {
    const assessment = [];

    const skillIntervals = {};
    for (const exp of experienceEvidence) {
       if (exp.durationMonths <= 0 || !exp.startDate || !exp.endDate) continue;
       
       const startParts = exp.startDate.split('-');
       const endParts = exp.endDate.split('-');
       const startAbs = parseInt(startParts[0]) * 12 + parseInt(startParts[1]);
       const endAbs = parseInt(endParts[0]) * 12 + parseInt(endParts[1]);

       for (const skill of exp.relevantSkills) {
         if (!skillIntervals[skill]) skillIntervals[skill] = [];
         skillIntervals[skill].push({ start: startAbs, end: endAbs, evidence: exp.evidence });
       }
    }

    const skillDurations = {};
    for (const [skill, intervals] of Object.entries(skillIntervals)) {
      intervals.sort((a, b) => a.start - b.start);
      let merged = [];
      for (const current of intervals) {
         if (merged.length === 0) {
           merged.push({...current});
         } else {
           const last = merged[merged.length - 1];
           if (current.start <= last.end) {
             // Overlap
             last.end = Math.max(last.end, current.end);
             last.evidence += " | " + current.evidence;
           } else {
             merged.push({...current});
           }
         }
      }
      let totalMonths = 0;
      let evidences = [];
      for (const m of merged) {
         let diff = (m.end - m.start);
         if (diff === 0) diff = 1;
         totalMonths += diff;
         evidences.push(m.evidence);
      }
      skillDurations[skill] = { months: totalMonths, evidences };
    }

    for (const req of jdReqs) {
      const skill = req.canonicalSkill;
      const demonstrated = skillDurations[skill];
      
      if (demonstrated) {
        assessment.push({
          canonicalSkill: skill,
          requiredMonths: req.requiredMonths,
          demonstratedMonths: demonstrated.months,
          durationStatus: demonstrated.months >= req.requiredMonths ? "meets" : "partial",
          evidence: demonstrated.evidences.join(" | "),
          section: "experience"
        });
      } else {
        assessment.push({
          canonicalSkill: skill,
          requiredMonths: req.requiredMonths,
          demonstratedMonths: 0,
          durationStatus: "missing",
          evidence: null,
          section: "experience"
        });
      }
    }

    return assessment;
  }
}

module.exports = new ExperienceAnalyzerV2();
