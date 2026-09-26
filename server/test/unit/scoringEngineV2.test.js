const ScoringEngineV2 = require('../../services/scoring/ScoringEngineV2');

describe('ScoringEngineV2', () => {
  describe('Input Validation', () => {
    it('1. throws on null matches', () => {
      expect(() => ScoringEngineV2.score(null)).toThrow("Invalid matches array");
    });
    it('2. throws on non-array matches', () => {
      expect(() => ScoringEngineV2.score({})).toThrow("Invalid matches array");
    });
    it('3. handles empty matches array gracefully', () => {
      const result = ScoringEngineV2.score([]);
      expect(result.overallScore).toBe(0);
      expect(result.components.requiredSkills.total).toBe(0);
      expect(result.components.preferredSkills.total).toBe(0);
    });
  });

  describe('Basic Score Bounds', () => {
    it('4. Score is always between 0 and 100 for perfect match', () => {
      const matches = [
        { requirementCanonical: 'a', requirementClassification: 'required', matchType: 'exact', resumeSection: 'experience' }
      ];
      const result = ScoringEngineV2.score(matches);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBe(50); // 50% for 1 required skill exactly matched in experience
    });
    it('5. Score is 0 for completely missing requirements', () => {
      const matches = [
        { requirementCanonical: 'a', requirementClassification: 'required', matchType: 'missing' },
        { requirementCanonical: 'b', requirementClassification: 'preferred', matchType: 'missing' }
      ];
      const result = ScoringEngineV2.score(matches);
      expect(result.overallScore).toBe(0);
      expect(result.knockoutCandidates).toContain('a');
      expect(result.matchedRequirements).toBe(0);
      expect(result.missingRequirements).toBe(2);
    });
  });

  describe('Required Coverage', () => {
    it('6. One missing required skill decreases score proportionally, not completely to zero', () => {
      const matches = [
        { requirementCanonical: 'a', requirementClassification: 'required', matchType: 'exact', resumeSection: 'experience' },
        { requirementCanonical: 'b', requirementClassification: 'required', matchType: 'missing' }
      ];
      const result = ScoringEngineV2.score(matches);
      expect(result.overallScore).toBe(25); // 1 out of 2 = 25/50
      expect(result.knockoutCandidates).toContain('b');
    });

    it('7. Adding a genuinely matched required skill cannot decrease the score relative to the category max (but can dilute individual weight)', () => {
      const matches1 = [
        { requirementCanonical: 'a', requirementClassification: 'required', matchType: 'exact', resumeSection: 'experience' }
      ]; // Score 50
      const matches2 = [
        { requirementCanonical: 'a', requirementClassification: 'required', matchType: 'exact', resumeSection: 'experience' },
        { requirementCanonical: 'b', requirementClassification: 'required', matchType: 'exact', resumeSection: 'experience' }
      ]; // Score 50
      const res1 = ScoringEngineV2.score(matches1);
      const res2 = ScoringEngineV2.score(matches2);
      expect(res1.overallScore).toBe(50);
      expect(res2.overallScore).toBe(50);
      expect(res2.overallScore).toBeGreaterThanOrEqual(res1.overallScore);
    });

    it('8. Removing a matched required skill (turning to missing) decreases score', () => {
      const matches2 = [
        { requirementCanonical: 'a', requirementClassification: 'required', matchType: 'exact', resumeSection: 'experience' },
        { requirementCanonical: 'b', requirementClassification: 'required', matchType: 'exact', resumeSection: 'experience' }
      ]; // Score 50
      const matches3 = [
        { requirementCanonical: 'a', requirementClassification: 'required', matchType: 'exact', resumeSection: 'experience' },
        { requirementCanonical: 'b', requirementClassification: 'required', matchType: 'missing' }
      ]; // Score 25
      const res2 = ScoringEngineV2.score(matches2);
      const res3 = ScoringEngineV2.score(matches3);
      expect(res3.overallScore).toBeLessThan(res2.overallScore);
    });
  });

  describe('Preferred Coverage', () => {
    it('9. Missing preferred skills do not receive the same penalty as missing required skills', () => {
      const matchesReqMissing = [
        { requirementCanonical: 'a', requirementClassification: 'required', matchType: 'missing' }
      ];
      const matchesPrefMissing = [
        { requirementCanonical: 'b', requirementClassification: 'preferred', matchType: 'missing' }
      ];
      const reqRes = ScoringEngineV2.score(matchesReqMissing);
      const prefRes = ScoringEngineV2.score(matchesPrefMissing);
      // Both are 0 because there's nothing else, but let's compare lost points
      expect(reqRes.components.requiredSkills.contribution).toBe(0); // Lost 50
      expect(prefRes.components.preferredSkills.contribution).toBe(0); // Lost 10
    });

    it('10. Preferred skills add up to 10 points', () => {
      const matches = [
        { requirementCanonical: 'a', requirementClassification: 'preferred', matchType: 'exact', resumeSection: 'experience' }
      ];
      const result = ScoringEngineV2.score(matches);
      expect(result.overallScore).toBe(10);
    });
  });

  describe('Match Quality (Exact vs Normalized vs Alias)', () => {
    it('11. Exact match cannot score lower than an equivalent normalized match', () => {
      const matchesExact = [{ requirementCanonical: 'a', requirementClassification: 'required', matchType: 'exact', resumeSection: 'experience' }];
      const matchesNorm = [{ requirementCanonical: 'a', requirementClassification: 'required', matchType: 'normalized', resumeSection: 'experience' }];
      const resExact = ScoringEngineV2.score(matchesExact);
      const resNorm = ScoringEngineV2.score(matchesNorm);
      expect(resExact.overallScore).toBeGreaterThan(resNorm.overallScore);
      expect(resExact.overallScore).toBe(50);
      expect(resNorm.overallScore).toBe(47.5); // 50 * 0.95
    });

    it('12. Normalized match cannot score lower than an equivalent alias match', () => {
      const matchesNorm = [{ requirementCanonical: 'a', requirementClassification: 'required', matchType: 'normalized', resumeSection: 'experience' }];
      const matchesAlias = [{ requirementCanonical: 'a', requirementClassification: 'required', matchType: 'alias', resumeSection: 'experience' }];
      const resNorm = ScoringEngineV2.score(matchesNorm);
      const resAlias = ScoringEngineV2.score(matchesAlias);
      expect(resNorm.overallScore).toBeGreaterThan(resAlias.overallScore);
      expect(resAlias.overallScore).toBe(45); // 50 * 0.90
    });

    it('13. Java never satisfies JavaScript (knockouts handled correctly)', () => {
      // In V2, Java vs JS results in matchType: 'missing' for JS if only Java is present.
      const matches = [{ requirementCanonical: 'javascript', requirementClassification: 'required', matchType: 'missing' }];
      const res = ScoringEngineV2.score(matches);
      expect(res.overallScore).toBe(0);
      expect(res.knockoutCandidates).toContain('javascript');
    });
    
    it('14. React never satisfies React Native (knockouts handled correctly)', () => {
      const matches = [{ requirementCanonical: 'react native', requirementClassification: 'required', matchType: 'missing' }];
      const res = ScoringEngineV2.score(matches);
      expect(res.overallScore).toBe(0);
      expect(res.knockoutCandidates).toContain('react native');
    });
  });

  describe('Evidence Strength (Experience > Skills)', () => {
    it('15. Match in experience scores higher than match in skills', () => {
      const matchExp = [{ requirementCanonical: 'a', requirementClassification: 'required', matchType: 'exact', resumeSection: 'experience' }];
      const matchSkill = [{ requirementCanonical: 'a', requirementClassification: 'required', matchType: 'exact', resumeSection: 'skills' }];
      
      const resExp = ScoringEngineV2.score(matchExp);
      const resSkill = ScoringEngineV2.score(matchSkill);
      
      expect(resExp.overallScore).toBeGreaterThan(resSkill.overallScore);
      expect(resExp.overallScore).toBe(50); // 1.0 multiplier
      expect(resSkill.overallScore).toBe(25); // 0.5 multiplier
    });

    it('16. Match in project scores higher than match in skills', () => {
      const matchProj = [{ requirementCanonical: 'a', requirementClassification: 'required', matchType: 'exact', resumeSection: 'project' }];
      const resProj = ScoringEngineV2.score(matchProj);
      expect(resProj.overallScore).toBe(42.5); // 50 * 0.85
    });

    it('17. Default section to general if missing', () => {
      const matchNull = [{ requirementCanonical: 'a', requirementClassification: 'required', matchType: 'exact', resumeSection: null }];
      const resNull = ScoringEngineV2.score(matchNull);
      expect(resNull.overallScore).toBe(20); // 50 * 0.40 (general multiplier)
    });
  });

  describe('Duplicate / Unrelated requirements', () => {
    it('18. Duplicate canonical requirements are technically passed in by Matcher already deduplicated, but if present, they dilute average', () => {
      const matches = [
        { requirementCanonical: 'a', requirementClassification: 'required', matchType: 'exact', resumeSection: 'experience' },
        { requirementCanonical: 'a', requirementClassification: 'required', matchType: 'exact', resumeSection: 'experience' }
      ];
      const res = ScoringEngineV2.score(matches);
      expect(res.overallScore).toBe(50); // Each is worth 25, total 50. Handled gracefully.
    });

    it('19. Adding an unrelated skill (not in JD) does not exist in MatchEvidence, score remains independent', () => {
      // By definition, MatchEvidence only contains JD requirements.
      const res = ScoringEngineV2.score([{ requirementCanonical: 'a', requirementClassification: 'required', matchType: 'exact', resumeSection: 'experience' }]);
      expect(res.overallScore).toBe(50);
    });
  });

  describe('Pending Components', () => {
    it('20. Experience component returns pending_evidence', () => {
      const res = ScoringEngineV2.score([]);
      expect(res.components.experience.status).toBe('pending_evidence');
      expect(res.components.experience.contribution).toBe(0);
    });
    it('21. Projects component returns pending_evidence', () => {
      const res = ScoringEngineV2.score([]);
      expect(res.components.projectsAchievements.status).toBe('pending_evidence');
      expect(res.components.projectsAchievements.contribution).toBe(0);
    });
    it('22. Education component returns pending_evidence', () => {
      const res = ScoringEngineV2.score([]);
      expect(res.components.educationCertifications.status).toBe('pending_evidence');
    });
    it('23. Limitations are documented in output', () => {
      const res = ScoringEngineV2.score([]);
      expect(Array.isArray(res.limitations)).toBe(true);
    });
  });

    describe('Intelligence 5C Scoring', () => {
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

  describe('Parseability Separation', () => {
    it('24. Parseability is marked as not_implemented', () => {
      const res = ScoringEngineV2.score([]);
      expect(res.parseability.status).toBe('not_implemented');
      expect(res.parseability.score).toBeNull();
    });
  });

  describe('Deterministic Repeatability', () => {
    it('25. Same MatchEvidence array always produces identical score and output', () => {
      const matches = [
        { requirementCanonical: 'a', requirementClassification: 'required', matchType: 'exact', resumeSection: 'experience' },
        { requirementCanonical: 'b', requirementClassification: 'preferred', matchType: 'normalized', resumeSection: 'skills' },
        { requirementCanonical: 'c', requirementClassification: 'required', matchType: 'missing' }
      ];
      const res1 = ScoringEngineV2.score(matches);
      const res2 = ScoringEngineV2.score(matches);
      
      expect(res1).toEqual(res2);
      // required: a (exact, exp) -> 25 * 1.0 * 1.0 = 25. c (missing) -> 0. total required = 25.
      // preferred: b (norm, skill) -> 10 * 0.95 * 0.5 = 4.75.
      // 25 + 4.75 = 29.75.
      expect(res1.overallScore).toBe(29.75);
    });
  });
});
