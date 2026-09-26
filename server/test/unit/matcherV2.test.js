const MatcherV2 = require('../../services/matching/MatcherV2');
const taxonomyService = require('../../services/taxonomy/skillTaxonomy');

describe('ATS V2 Matcher (Phase 5A)', () => {
  let emptyResume;
  
  beforeEach(() => {
    emptyResume = {
      candidate: {},
      summary: null,
      experience: [],
      education: [],
      projects: [],
      certifications: [],
      allSkills: []
    };
  });

  const mockJD = (reqs) => ({
    roleTitle: "Test Role",
    domain: "Test",
    seniority: "Test",
    minYearsExperience: 0,
    requirements: reqs,
    responsibilities: []
  });

  it('', async () => {
    emptyResume.allSkills = [{ canonical: "react", original: "React", section: "skills", evidence: "React", confidence: 1, evidenceType: "explicit" }];
    const jd = mockJD([{ canonical: "react", original: "React", classification: "required", evidence: "React is required." }]);
    
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results[0].matchType).toBe("exact");
    expect(results[0].requirementCanonical).toBe("react");
  });

  it('', async () => {
    emptyResume.allSkills = [{ canonical: "react", original: "rEaCt", section: "skills", evidence: "rEaCt", confidence: 1, evidenceType: "explicit" }];
    const jd = mockJD([{ canonical: "react", original: "REACT", classification: "required", evidence: "REACT." }]);
    
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results[0].matchType).toBe("exact"); // exact because the original text normalized to lower is the same
  });

  it('', async () => {
    emptyResume.allSkills = [{ canonical: "react", original: "React.js", section: "skills", evidence: "React.js", confidence: 1, evidenceType: "explicit" }];
    const jd = mockJD([{ canonical: "react", original: "React", classification: "required", evidence: "React." }]);
    
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results[0].matchType).toBe("alias");
    expect(results[0].requirementCanonical).toBe("react");
  });

  it('', async () => {
    emptyResume.allSkills = [{ canonical: "node.js", original: "NodeJS", section: "skills", evidence: "NodeJS", confidence: 1, evidenceType: "explicit" }];
    const jd = mockJD([{ canonical: "node.js", original: "Node.js", classification: "required", evidence: "Node.js." }]);
    
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results[0].matchType).toBe("alias");
    expect(results[0].requirementCanonical).toBe("node.js");
  });

  it('', async () => {
    emptyResume.allSkills = [{ canonical: "postgresql", original: "Postgres", section: "skills", evidence: "Postgres", confidence: 1, evidenceType: "explicit" }];
    const jd = mockJD([{ canonical: "postgresql", original: "PostgreSQL", classification: "required", evidence: "PostgreSQL." }]);
    
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results[0].matchType).toBe("alias");
    expect(results[0].requirementCanonical).toBe("postgresql");
  });

  it('', async () => {
    emptyResume.allSkills = [{ canonical: "javascript", original: "JavaScript", section: "skills", evidence: "JavaScript", confidence: 1, evidenceType: "explicit" }];
    const jd = mockJD([{ canonical: "java", original: "Java", classification: "required", evidence: "Java." }]);
    
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results[0].matchType).toBe("missing");
    expect(results[0].requirementCanonical).toBe("java");
  });

  it('', async () => {
    emptyResume.allSkills = [{ canonical: "react", original: "React", section: "skills", evidence: "React", confidence: 1, evidenceType: "explicit" }];
    const jd = mockJD([{ canonical: "react native", original: "React Native", classification: "required", evidence: "React Native." }]);
    
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results[0].matchType).toBe("missing");
  });

  it('', async () => {
    emptyResume.allSkills = [{ canonical: "react", original: "React", section: "skills", evidence: "React", confidence: 1, evidenceType: "explicit" }];
    const jd = mockJD([{ canonical: "react", original: "React", classification: "required", evidence: "React." }]);
    
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results[0].requirementClassification).toBe("required");
  });

  it('', async () => {
    emptyResume.allSkills = [{ canonical: "react", original: "React", section: "skills", evidence: "React", confidence: 1, evidenceType: "explicit" }];
    const jd = mockJD([{ canonical: "react", original: "React", classification: "preferred", evidence: "React." }]);
    
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results[0].requirementClassification).toBe("preferred");
  });

  it('', async () => {
    emptyResume.allSkills = [{ canonical: "react", original: "React", section: "skills", evidence: "Just React", confidence: 1, evidenceType: "explicit" }];
    emptyResume.experience = [{
      skills: [{ canonical: "react", original: "React", section: "experience", evidence: "Built app with React", confidence: 1, evidenceType: "explicit" }]
    }];
    const jd = mockJD([{ canonical: "react", original: "React", classification: "required", evidence: "React." }]);
    
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results[0].resumeSection).toBe("experience");
    expect(results[0].resumeEvidence).toBe("Built app with React");
  });

  it('', async () => {
    emptyResume.projects = [{
      skills: [{ canonical: "react", original: "React", section: "project", evidence: "Project with React", confidence: 1, evidenceType: "explicit" }]
    }];
    const jd = mockJD([{ canonical: "react", original: "React", classification: "required", evidence: "React." }]);
    
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results[0].resumeSection).toBe("project");
  });

  it('', async () => {
    emptyResume.allSkills = [{ canonical: "react", original: "React", section: "skills", evidence: "React", confidence: 1, evidenceType: "explicit" }];
    const jd = mockJD([{ canonical: "react", original: "React", classification: "required", evidence: "React." }]);
    
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results[0].resumeSection).toBe("skills");
  });

  it('', async () => {
    const jd = mockJD([{ canonical: "aws", original: "AWS", classification: "required", evidence: "AWS." }]);
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results[0].matchType).toBe("missing");
    expect(results[0].requirementClassification).toBe("required");
  });

  it('', async () => {
    const jd = mockJD([{ canonical: "aws", original: "AWS", classification: "preferred", evidence: "AWS." }]);
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results[0].matchType).toBe("missing");
    expect(results[0].requirementClassification).toBe("preferred");
  });

  it('', async () => {
    emptyResume.allSkills = [
      { canonical: "react", original: "React", section: "skills", evidence: "React", confidence: 1 },
      { canonical: "react", original: "React", section: "skills", evidence: "React", confidence: 1 }
    ];
    const jd = mockJD([{ canonical: "react", original: "React", classification: "required", evidence: "React." }]);
    
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results.length).toBe(1);
    expect(results[0].allResumeEvidences.length).toBe(1);
  });

  it('', async () => {
    emptyResume.allSkills = [{ canonical: "react", original: "React", section: "skills", evidence: "React", confidence: 1, evidenceType: "explicit" }];
    const jd = mockJD([
      { canonical: "react", original: "React", classification: "required", evidence: "React." },
      { canonical: "react", original: "React", classification: "required", evidence: "React again." }
    ]);
    
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results.length).toBe(1);
  });

  it('', async () => {
    // JD wants python, resume has PyTorch. Taxonomy shouldn't alias them.
    emptyResume.allSkills = [{ canonical: "pytorch", original: "PyTorch", section: "skills", evidence: "PyTorch", confidence: 1, evidenceType: "explicit" }];
    const jd = mockJD([{ canonical: "python", original: "Python", classification: "required", evidence: "Python." }]);
    
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results[0].matchType).toBe("missing");
  });

  it('', async () => {
    expect(taxonomyService.resolveCanonical("React.js")).toBe("react");
    expect(taxonomyService.resolveCanonical("C#")).toBe("c#");
    expect(taxonomyService.resolveCanonical("ci/cd")).toBe("ci/cd");
    expect(taxonomyService.resolveCanonical("dot net")).toBe(".net");
  });

  it('', async () => {
    const exactSentence = "I built a highly scalable microservice using Node.js and Express.";
    emptyResume.experience = [{
      skills: [{ canonical: "node.js", original: "Node.js", section: "experience", evidence: exactSentence, confidence: 1, evidenceType: "explicit" }]
    }];
    const jd = mockJD([{ canonical: "node.js", original: "Node.js", classification: "required", evidence: "Node.js." }]);
    
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results[0].resumeEvidence).toBe(exactSentence);
  });

  it('', async () => {
    emptyResume.allSkills = [{ canonical: "react", original: "React", section: "skills", evidence: "React", confidence: 1, evidenceType: "explicit" }];
    const jd = mockJD([{ canonical: "react", original: "React", classification: "required", evidence: "React." }]);
    
    const results = await MatcherV2.match(emptyResume, jd);
    expect(results[0].confidence).toBeGreaterThanOrEqual(0);
    expect(results[0].confidence).toBeLessThanOrEqual(1);
  });
});
