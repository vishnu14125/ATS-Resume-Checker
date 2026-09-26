const ExperienceAnalyzerV2 = require('../../services/intelligence/ExperienceAnalyzerV2');

describe('ExperienceAnalyzerV2 - Hardening', () => {
  const REF_DATE = new Date('2024-01-01T00:00:00Z');

  describe('1. Date Hardening', () => {
    const parseExp = (dates) => {
      const parsed = ExperienceAnalyzerV2._parseResumeExperiences({ experience: [{ dates }] }, REF_DATE);
      return parsed[0];
    };

    it('Jan 2022 - Dec 2022', () => {
      const p = parseExp('Jan 2022 - Dec 2022');
      expect(p.durationMonths).toBe(11); // 12 - 1 = 11. (Or 12 depending on inclusive vs exclusive. Our logic is end-start, so 11)
      expect(p.datePrecision).toBe('month');
    });

    it('Jan 2022 - Jan 2023', () => {
      expect(parseExp('Jan 2022 - Jan 2023').durationMonths).toBe(12);
    });

    it('03/2022 - 08/2024', () => {
      // 2024*12+8 = 24296. 2022*12+3 = 24267. 29.
      // But ref is 2024-01!
      // End is capped at reference date (2024-01). So end is 2024*12+1 = 24289. 
      // 24289 - 24267 = 22.
      expect(parseExp('03/2022 - 08/2024').durationMonths).toBe(22);
    });

    it('2022 - 2023', () => {
      expect(parseExp('2022 - 2023').durationMonths).toBe(12);
    });

    it('2022 - Present', () => {
      const p = parseExp('2022 - Present');
      expect(p.durationMonths).toBe(24); // 2024-01 - 2022-01 = 24
      expect(p.isCurrent).toBe(true);
    });

    it('January 2022 - Current', () => {
      expect(parseExp('January 2022 - Current').durationMonths).toBe(24);
      expect(parseExp('January 2022 - Current').isCurrent).toBe(true);
    });

    it('Present only', () => {
      expect(parseExp('Present').durationMonths).toBe(1); // Single date falls back to 1 month
      expect(parseExp('Present').isCurrent).toBe(true);
    });

    it('Invalid month', () => {
      expect(parseExp('Foo 2022 - Bar 2023').durationMonths).toBe(12); // Fallbacks to year! "2022 - 2023"
    });

    it('Invalid year', () => {
      expect(parseExp('Jan 22 - Dec 23').durationMonths).toBe(0); // Not 4 digits
      expect(parseExp('Jan 22 - Dec 23').datePrecision).toBe('unknown');
    });

    it('Future start date', () => {
      expect(parseExp('Jan 2025 - Dec 2025').durationMonths).toBe(0);
    });

    it('End before start', () => {
      expect(parseExp('Dec 2022 - Jan 2022').durationMonths).toBe(0);
    });

    it('Missing start or end', () => {
      expect(parseExp('2022').durationMonths).toBe(1);
    });
  });

  describe('2. Experience Overlap Hardening', () => {
    it('Merges identical overlapping intervals for same skill', () => {
      const expEvidence = [
        { startDate: "2022-01", endDate: "2022-12", durationMonths: 11, relevantSkills: ['react'], evidence: 'Job A' },
        { startDate: "2022-01", endDate: "2022-12", durationMonths: 11, relevantSkills: ['react'], evidence: 'Job B' }
      ];
      const assessment = ExperienceAnalyzerV2._assessRequirements([{ canonicalSkill: 'react', requiredMonths: 24 }], expEvidence);
      expect(assessment[0].demonstratedMonths).toBe(11); // Not 22
    });

    it('Merges partial overlapping intervals for same skill', () => {
      const expEvidence = [
        { startDate: "2022-01", endDate: "2022-12", durationMonths: 11, relevantSkills: ['react'], evidence: 'Job A' },
        { startDate: "2022-07", endDate: "2023-06", durationMonths: 11, relevantSkills: ['react'], evidence: 'Job B' }
      ];
      const assessment = ExperienceAnalyzerV2._assessRequirements([{ canonicalSkill: 'react', requiredMonths: 24 }], expEvidence);
      expect(assessment[0].demonstratedMonths).toBe(17); // 2022-01 to 2023-06 => 17 months
    });

    it('Does not merge intervals for different skills', () => {
      const expEvidence = [
        { startDate: "2022-01", endDate: "2022-12", durationMonths: 11, relevantSkills: ['react'], evidence: 'Job A' },
        { startDate: "2022-01", endDate: "2022-12", durationMonths: 11, relevantSkills: ['node.js'], evidence: 'Job B' }
      ];
      const reqs = [
        { canonicalSkill: 'react', requiredMonths: 24 },
        { canonicalSkill: 'node.js', requiredMonths: 24 }
      ];
      const assessment = ExperienceAnalyzerV2._assessRequirements(reqs, expEvidence);
      expect(assessment.find(a => a.canonicalSkill === 'react').demonstratedMonths).toBe(11);
      expect(assessment.find(a => a.canonicalSkill === 'node.js').demonstratedMonths).toBe(11);
    });
  });

  describe('3. JD Experience Requirement Hardening', () => {
    const parseReq = (text) => ExperienceAnalyzerV2._parseJDRequirements({ rawText: text });

    it('Parses various phrasing correctly', () => {
      expect(parseReq('3+ years of React')[0].requiredMonths).toBe(36);
      expect(parseReq('3 years of React experience')[0].requiredMonths).toBe(36);
      expect(parseReq('minimum 3 years of React')[0].requiredMonths).toBe(36);
      expect(parseReq('at least 3 years with React')[0].requiredMonths).toBe(36);
      expect(parseReq('2 years of Node.js')[0].requiredMonths).toBe(24);
      expect(parseReq('5+ years of software engineering')[0].requiredMonths).toBe(60);
    });

    it('Parses multiple requirements on one line', () => {
      const reqs = parseReq('3+ years React and 2+ years Node.js');
      expect(reqs.length).toBe(2);
      expect(reqs.find(r => r.canonicalSkill === 'react').requiredMonths).toBe(36);
      expect(reqs.find(r => r.canonicalSkill === 'node.js').requiredMonths).toBe(24);
    });

    it('Deduplicates and takes maximum required duration', () => {
      const reqs = parseReq('3+ years React\n5 years React');
      expect(reqs.length).toBe(1);
      expect(reqs[0].requiredMonths).toBe(60);
    });
  });
});
