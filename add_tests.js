const fs = require('fs');
let code = fs.readFileSync('server/test/unit/scoringEngineV2.test.js', 'utf8');
code = code.replace("describe('Parseability Separation'", `  describe('Intelligence 5C Scoring', () => {
    it('26. Experience yields full 20 points if duration matches requirement', () => {
      const matches = [{ requirementCanonical: 'react', requirementClassification: 'required', matchType: 'exact', resumeSection: 'experience' }];
      const intel = {
        experienceAssessment: [
          { canonicalSkill: 'react', requiredMonths: 36, demonstratedMonths: 36, durationStatus: 'meets' }
        ],
        projectEvidence: [], educationAssessment: [], certificationAssessment: []
      };
      const res = ScoringEngineV2.score(matches, intel);
      expect(res.components.experience.status).toBe('assessed');
      expect(res.components.experience.contribution).toBe(20);
    });

    it('27. Experience yields partial points if duration is partial', () => {
      const matches = [{ requirementCanonical: 'react', requirementClassification: 'required', matchType: 'exact', resumeSection: 'experience' }];
      const intel = {
        experienceAssessment: [
          { canonicalSkill: 'react', requiredMonths: 40, demonstratedMonths: 20, durationStatus: 'partial' }
        ]
      };
      const res = ScoringEngineV2.score(matches, intel);
      expect(res.components.experience.contribution).toBe(10); // 20/40 = 0.5 * 20
    });

    it('28. Project yields points if matching requirements', () => {
      const matches = [{ requirementCanonical: 'react', requirementClassification: 'required', matchType: 'exact', resumeSection: 'experience' }];
      const intel = {
        projectEvidence: [
          { relevantSkills: ['react'] }
        ]
      };
      const res = ScoringEngineV2.score(matches, intel);
      expect(res.components.projectsAchievements.contribution).toBe(10);
    });

    it('29. Education yields points if matching JD requirements', () => {
      const matches = [];
      const intel = {
        educationAssessment: [
          { status: 'meets' }
        ]
      };
      const res = ScoringEngineV2.score(matches, intel);
      expect(res.components.educationCertifications.contribution).toBe(10);
    });
    
    it('30. Education yields 0 points if missing JD requirements', () => {
      const matches = [];
      const intel = {
        educationAssessment: [
          { status: 'missing' }
        ]
      };
      const res = ScoringEngineV2.score(matches, intel);
      expect(res.components.educationCertifications.contribution).toBe(0);
    });
  });

  describe('Parseability Separation'`);
fs.writeFileSync('server/test/unit/scoringEngineV2.test.js', code);
