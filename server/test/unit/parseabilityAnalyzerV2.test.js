const ParseabilityAnalyzerV2 = require('../../services/parseability/ParseabilityAnalyzerV2');

describe('ParseabilityAnalyzerV2', () => {
  const cleanProfile = {
    contact: { email: "test@test.com", phone: "123" },
    experience: [{ title: "Dev", dates: "2020-2022" }],
    education: [{ degree: "BS" }],
    skills: ["React", "Node"]
  };
  const cleanText = "A very long text string that meets the minimum length requirement easily... ".repeat(20);

  it('1. Clean resume yields high parseability', () => {
    const res = ParseabilityAnalyzerV2.analyze(cleanText, cleanProfile, { format: "PDF" });
    expect(res.score).toBeGreaterThanOrEqual(90);
    expect(res.status).toBe('good');
    expect(res.warnings.length).toBe(0);
    expect(res.capabilities.visualLayoutAnalysis).toBe('not_available');
  });

  it('2. Minimal resume missing optional sections does not catastrophically fail', () => {
    const minimalProfile = {
      contact: { email: "test@test.com" },
      experience: [{ title: "Dev", dates: "2020-2022" }],
      skills: ["React"]
    };
    const res = ParseabilityAnalyzerV2.analyze(cleanText, minimalProfile);
    expect(res.score).toBeGreaterThan(70);
    expect(res.components.educationExtraction.status).toBe('not_applicable');
    expect(res.components.projectExtraction.status).toBe('not_applicable');
  });

  it('3. No extracted text creates a clear fatal result', () => {
    const res = ParseabilityAnalyzerV2.analyze("", cleanProfile);
    expect(res.score).toBe(0);
    expect(res.status).toBe('fatal');
    expect(res.warnings[0].severity).toBe('fatal');
  });

  it('4. Very short extraction triggers fatal status', () => {
    const res = ParseabilityAnalyzerV2.analyze("Too short", cleanProfile);
    expect(res.score).toBe(0);
    expect(res.status).toBe('fatal');
    expect(res.components.textExtraction.score).toBe(10);
  });

  it('5. Corrupted text triggers extraction noise warning', () => {
    const corruptedText = "Valid text ".repeat(15) + "\uFFFD\uFFFD\uFFFD".repeat(20);
    const res = ParseabilityAnalyzerV2.analyze(corruptedText, cleanProfile);
    expect(res.components.textExtraction.score).toBeLessThan(100);
    expect(res.warnings.some(w => w.code === 'EXTRACTION_NOISE')).toBe(true);
  });

  it('6. Missing email yields a warning and lower contact score', () => {
    const noEmailProfile = { ...cleanProfile, contact: { phone: "123" } };
    const res = ParseabilityAnalyzerV2.analyze(cleanText, noEmailProfile);
    expect(res.components.contactExtraction.score).toBe(30);
    expect(res.warnings.some(w => w.code === 'MISSING_EMAIL')).toBe(true);
  });

  it('7. Missing experience yields a poor experience score', () => {
    const noExpProfile = { ...cleanProfile, experience: [] };
    const res = ParseabilityAnalyzerV2.analyze(cleanText, noExpProfile);
    expect(res.components.experienceExtraction.score).toBe(0);
    expect(res.warnings.some(w => w.code === 'WEAK_EXPERIENCE_DETECTION')).toBe(true);
  });

  it('8. Missing skills yields poor skills extraction', () => {
    const noSkillsProfile = { ...cleanProfile, skills: [] };
    const res = ParseabilityAnalyzerV2.analyze(cleanText, noSkillsProfile);
    expect(res.components.skillsExtraction.score).toBe(0);
  });

  it('9. TXT metadata format is preserved', () => {
    const res = ParseabilityAnalyzerV2.analyze(cleanText, cleanProfile, { format: "TXT" });
    expect(res.documentFormat).toBe("TXT");
  });

  it('10. Score is always between 0 and 100', () => {
    const res = ParseabilityAnalyzerV2.analyze(cleanText, cleanProfile);
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(100);
  });
});
