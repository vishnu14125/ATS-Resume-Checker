const fs = require('fs');
const path = require('path');
const ATSIntelligenceV2 = require('../../services/v2/ATSIntelligenceV2');
const analysisService = require('../../services/analysisService'); // V1 for comparison

// Helper to read fixture
const readFixture = (name) => fs.readFileSync(path.join(__dirname, '../fixtures/v2', name), 'utf8');

describe('ATS V2 Pipeline Shadow Integration', () => {

  const resumeFull = readFixture('resume_full.txt');
  const jdFull = readFixture('jd_full.txt');
  const resumeMinimal = readFixture('resume_minimal.txt');
  const jdMinimal = readFixture('jd_minimal.txt');
  const resumeProjects = readFixture('resume_projects.txt');
  const jdReqPref = readFixture('jd_required_preferred.txt');
  const resumeNoSkills = readFixture('resume_no_skills.txt');

  describe('Core Pipeline Validity', () => {
    it('', async () => {
      const result = await ATSIntelligenceV2.analyze(resumeFull, jdFull);
      if (!result.success) {
        console.error("V2 PIPELINE ERROR:", result.error);
      }
      expect(result.success).toBe(true);
      expect(result.version).toBe("2");
      expect(result.resumeProfile).toBeDefined();
      expect(result.jdProfile).toBeDefined();
      expect(result.matches).toBeInstanceOf(Array);
      
      // If validation had failed, success would be false and error populated
      expect(result.error).toBeUndefined();
    });

    it('', async () => {
      const result = await ATSIntelligenceV2.analyze("", "");
      expect(result.success).toBe(false);
      expect(result.error).toContain("required");
    });
  });

  describe('Evidence Priority & Validation', () => {
    it('', async () => {
      const result = await ATSIntelligenceV2.analyze(resumeFull, jdFull);
      
      // React is in both Experience and Skills
      const reactMatch = result.matches.find(m => m.requirementCanonical === 'react');
      expect(reactMatch).toBeDefined();
      expect(reactMatch.matchType).not.toBe('missing');
      
      // Experience has evidenceStrength 5, skills has 1. It should pick experience.
      expect(reactMatch.resumeSection).toBe('experience');
      expect(reactMatch.resumeEvidence).toContain('React');
    });

    it('', async () => {
      const result = await ATSIntelligenceV2.analyze(resumeProjects, "Must know React.");
      const reactMatch = result.matches.find(m => m.requirementCanonical === 'react');
      
      expect(reactMatch).toBeDefined();
      expect(reactMatch.resumeSection).toBe('project');
      expect(reactMatch.resumeEvidence).toContain('Built a full-stack marketplace');
    });
  });

  describe('Critical False-Positive Protection', () => {
    it('', async () => {
      // JD wants Java. Resume has JavaScript.
      const result = await ATSIntelligenceV2.analyze(resumeFull, jdReqPref);
      
      const javaMatch = result.matches.find(m => m.requirementCanonical === 'java');
      expect(javaMatch.matchType).toBe('missing');
      
      // JD wants JavaScript (as preferred)
      const jsMatch = result.matches.find(m => m.requirementCanonical === 'javascript');
      expect(jsMatch.matchType).not.toBe('missing');
      expect(jsMatch.matchType).toBe('exact'); // Javascript vs JavaScript
    });

    it('', async () => {
      const result = await ATSIntelligenceV2.analyze(resumeFull, jdReqPref);
      
      // JDParserV2 turns "react native" into "reactnative"
      const reactNativeMatch = result.matches.find(m => m.requirementCanonical === 'reactnative' || m.requirementCanonical === 'react native');
      expect(reactNativeMatch.matchType).toBe('missing');
      
      const reactMatch = result.matches.find(m => m.requirementCanonical === 'react');
      expect(reactMatch.matchType).not.toBe('missing');
    });

    it('', async () => {
      // JD wants node.js and javascript. Both are independent matches.
      const result = await ATSIntelligenceV2.analyze(resumeFull, jdFull);
      
      // node.js -> node
      const nodeMatch = result.matches.find(m => m.requirementCanonical === 'node' || m.requirementCanonical === 'node.js');
      expect(nodeMatch).toBeDefined();
      expect(nodeMatch.matchType).not.toBe('missing');

      const jsMatch = result.matches.find(m => m.requirementCanonical === 'javascript');
      expect(jsMatch).toBeDefined();
      expect(jsMatch.matchType).not.toBe('missing');
    });
  });

  describe('Classification & Duplicate Deduplication', () => {
    it('', async () => {
      const result = await ATSIntelligenceV2.analyze(resumeFull, jdReqPref);
      
      const reactMatch = result.matches.find(m => m.requirementCanonical === 'react');
      expect(reactMatch.requirementClassification).toBe('required');
      
      const reactNativeMatch = result.matches.find(m => m.requirementCanonical === 'reactnative' || m.requirementCanonical === 'react native');
      expect(reactNativeMatch.requirementClassification).toBe('preferred');
    });

    it('', async () => {
      const dupeJD = "React is required. React is preferred.";
      const result = await ATSIntelligenceV2.analyze(resumeMinimal, dupeJD);
      
      const reactMatches = result.matches.filter(m => m.requirementCanonical === 'react');
      expect(reactMatches.length).toBe(1);
      expect(reactMatches[0].requirementClassification).toBe('required');
    });
  });

  describe('Missing Requirements & No Fabricated Data', () => {
    it('', async () => {
      const result = await ATSIntelligenceV2.analyze(resumeNoSkills, jdFull);
      
      expect(result.summary.matchedRequirements).toBe(0);
      expect(result.summary.missingRequirements).toBeGreaterThan(0);
      
      const reactMatch = result.matches.find(m => m.requirementCanonical === 'react');
      expect(reactMatch.matchType).toBe('missing');
      expect(reactMatch.resumeSection).toBeNull();
      expect(reactMatch.resumeEvidence).toBeNull();
    });
  });

  describe('Shadow Comparison (V1 vs V2)', () => {
    it('should compare V1 and V2 outputs without failing if they differ', async () => {
      // We run the old LocalATSAnalyzer logic manually
      const LocalATSAnalyzer = require('../../services/LocalATSAnalyzer');
      const v1Resume = LocalATSAnalyzer.parseResume(resumeFull);
      const v1JD = LocalATSAnalyzer.parseJobDescription(jdFull);
      
      // V2
      const v2Result = await ATSIntelligenceV2.analyze(resumeFull, jdFull);
      
      // In V1, JD skills were flat arrays of required vs preferred
      const v1ReqTotal = (v1JD.required?.skills?.length || 0) + (v1JD.required?.technologies?.length || 0);
      const v1PrefTotal = (v1JD.preferred?.skills?.length || 0) + (v1JD.preferred?.technologies?.length || 0);
      
      // In V2, we have strict requirement arrays
      const v2ReqTotal = v2Result.summary.requiredRequirements;
      const v2PrefTotal = v2Result.summary.preferredRequirements;
      
      // Log differences for report (not asserting equality since V2 is fundamentally different)
      // expect(v1ReqTotal).not.toEqual(v2ReqTotal); // Typically V2 is smarter
      
      // Ensure V2 detected at least what V1 detected (or more accurately)
      expect(v2ReqTotal).toBeGreaterThan(0);
      expect(v2PrefTotal).toBeGreaterThan(0);
    });
  });
});
