const CertificationAnalyzerV2 = require('../../services/intelligence/CertificationAnalyzerV2');

describe('CertificationAnalyzerV2 - Hardening', () => {
  it('1. Parses known certifications explicitly', () => {
    const jd = { rawText: "Must have PMP and AWS Solutions Architect" };
    const reqs = CertificationAnalyzerV2._parseJDCertifications(jd);
    expect(reqs.map(r => r.cert)).toContain('pmp');
    expect(reqs.map(r => r.cert)).toContain('aws solutions architect');
  });

  it('2. Matches exactly in certifications array', () => {
    const jd = { rawText: "Must have PMP" };
    const resume = { certifications: [{ name: "PMP Certified" }] };
    expect(CertificationAnalyzerV2.analyze(resume, jd).assessment[0].status).toBe('meets');
  });

  it('3. Does NOT invent certifications from general experience text', () => {
    const jd = { rawText: "Requires AWS Certified Developer" };
    // The candidate says "Worked with AWS" - this shouldn't count as AWS Certified
    const resume = { rawText: "I worked with AWS for 5 years." };
    const res = CertificationAnalyzerV2.analyze(resume, jd);
    expect(res.assessment[0].status).toBe('missing');
  });

  it('4. Matches explicit cert in raw text', () => {
    const jd = { rawText: "Requires PMP" };
    const resume = { rawText: "I achieved my PMP certification in 2021." };
    const res = CertificationAnalyzerV2.analyze(resume, jd);
    expect(res.assessment[0].status).toBe('meets');
  });
});
