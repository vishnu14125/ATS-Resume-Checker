const KnockoutAnalyzerV2 = require('../../services/intelligence/KnockoutAnalyzerV2');

describe('KnockoutAnalyzerV2', () => {
  it('1. Missing required skill generates knockout', () => {
    const evidence = [{ requirement: "Docker", required: true, status: 'MISSING', category: "skill" }];
    const res = KnockoutAnalyzerV2.analyze(evidence);
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe('MISSING');
    expect(res[0].severity).toBe('critical');
  });

  it('2. Missing preferred skill does NOT generate knockout', () => {
    const evidence = [{ requirement: "Docker", required: false, status: 'MISSING', category: "skill" }];
    const res = KnockoutAnalyzerV2.analyze(evidence);
    expect(res).toHaveLength(0);
  });

  it('3. Partial experience generates high severity knockout', () => {
    const evidence = [{ requirement: "React", required: true, status: 'PARTIAL', category: "experience", canonical: "react" }];
    const intel = { experience: [{ canonicalSkill: "react", requiredMonths: 36, demonstratedMonths: 24 }] };
    const res = KnockoutAnalyzerV2.analyze(evidence, intel);
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe('PARTIAL');
    expect(res[0].severity).toBe('high');
    expect(res[0].demonstratedMonths).toBe(24);
  });

  it('4. Education missing explicitly documented as such', () => {
    const evidence = [{ requirement: "Bachelor's", required: true, status: 'MISSING', category: "education" }];
    const res = KnockoutAnalyzerV2.analyze(evidence);
    expect(res[0].reason).toContain('Student status or related experience cannot be inferred');
  });
});
