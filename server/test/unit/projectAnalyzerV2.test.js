const ProjectAnalyzerV2 = require('../../services/intelligence/ProjectAnalyzerV2');

describe('ProjectAnalyzerV2 - Hardening', () => {
  it('1. No points for just having projects', () => {
    const resume = { projects: [{ description: "Built a web application." }] };
    // Mapped match is empty because Matcher didn't find React
    const res = ProjectAnalyzerV2.analyze(resume, {}, []);
    expect(res.projectEvidence.length).toBe(0);
  });

  it('2. React project evidence mapped explicitly', () => {
    const resume = { projects: [{ title: "App", description: "Built a web application using React." }] };
    const matches = [{ requirementCanonical: "react", resumeSection: "project", resumeEvidence: "Built a web application using React." }];
    const res = ProjectAnalyzerV2.analyze(resume, {}, matches);
    expect(res.projectEvidence.length).toBe(1);
    expect(res.projectEvidence[0].relevantSkills).toContain('react');
  });

  it('3. Preserves Matcher policy (e.g. React Native vs React)', () => {
    // MatcherV2 will NOT output a match for "react" if it was "react native" and was knocked out.
    // If Matcher gives no matches, project gives no evidence.
    const resume = { projects: [{ description: "Built using React Native." }] };
    const matches = []; // Matcher gives nothing
    const res = ProjectAnalyzerV2.analyze(resume, {}, matches);
    expect(res.projectEvidence.length).toBe(0);
  });
});
