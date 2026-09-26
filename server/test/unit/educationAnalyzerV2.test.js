const EducationAnalyzerV2 = require('../../services/intelligence/EducationAnalyzerV2');

describe('EducationAnalyzerV2 - Hardening', () => {
  it('1. Parses JD education explicitly', () => {
    const jd = { rawText: "Requires a Bachelor's degree or higher. Master's preferred." };
    const reqs = EducationAnalyzerV2._parseJDEducation(jd);
    expect(reqs.length).toBe(2);
    expect(reqs.map(r => r.degree)).toContain('bachelors');
    expect(reqs.map(r => r.degree)).toContain('masters');
  });

  it('2. Matches exactly B.Tech to bachelors', () => {
    const jd = { rawText: "Requires a BS degree" };
    const resume = { education: [{ originalText: "B.Tech Computer Science" }] };
    
    const res = EducationAnalyzerV2.analyze(resume, jd);
    expect(res.assessment.length).toBe(1);
    expect(res.assessment[0].status).toBe('meets');
  });

  it('3. Misses when education does not align', () => {
    const jd = { rawText: "Requires a Master's degree" };
    const resume = { education: [{ originalText: "B.S. in Biology" }] };
    
    const res = EducationAnalyzerV2.analyze(resume, jd);
    expect(res.assessment[0].status).toBe('missing');
  });

  it('4. Handles no JD education requirements gracefully', () => {
    const jd = { rawText: "Looking for a software engineer." };
    const resume = { education: [{ originalText: "B.Tech Computer Science" }] };
    
    const res = EducationAnalyzerV2.analyze(resume, jd);
    expect(res.jdRequirements.length).toBe(0);
    expect(res.assessment.length).toBe(0);
  });

  it('5. Does not match substrings like "ba" in "bachelor"', () => {
    // If the JD explicitly asks for B.A., a user with "I have a ba" should match, but "I am a bad student" should NOT.
    const jd = { rawText: "Requires a B.A. degree" }; // Will parse as bachelors
    const resume = { education: [{ originalText: "I am a bad student" }] };
    const res = EducationAnalyzerV2.analyze(resume, jd);
    expect(res.assessment[0].status).toBe('missing');
  });

  it('6. Does not infer degree from student status', () => {
    const jd = { rawText: "Requires a Bachelor's degree" };
    const resume = { education: [{ originalText: "Computer Science student" }] };
    const res = EducationAnalyzerV2.analyze(resume, jd);
    expect(res.assessment[0].status).toBe('missing');
  });

  it('7. Matches edge case formats like M.Tech, M.Sc, PhD', () => {
    const jd1 = { rawText: "Requires Master's" };
    expect(EducationAnalyzerV2.analyze({ education: [{ originalText: "M.Tech" }] }, jd1).assessment[0].status).toBe('meets');
    expect(EducationAnalyzerV2.analyze({ education: [{ originalText: "M.Sc" }] }, jd1).assessment[0].status).toBe('meets');
    expect(EducationAnalyzerV2.analyze({ education: [{ originalText: "MBA" }] }, jd1).assessment[0].status).toBe('meets');

    const jd2 = { rawText: "Requires PhD" };
    expect(EducationAnalyzerV2.analyze({ education: [{ originalText: "Ph.D." }] }, jd2).assessment[0].status).toBe('meets');
    expect(EducationAnalyzerV2.analyze({ education: [{ originalText: "Doctorate" }] }, jd2).assessment[0].status).toBe('meets');
  });
});
