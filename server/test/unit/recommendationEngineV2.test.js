const RecommendationEngineV2 = require('../../services/recommendations/RecommendationEngineV2');

describe('RecommendationEngineV2', () => {
  it('1. Generates parseability recommendations', () => {
    const warnings = [{ code: 'FATAL_TEXT_EXTRACTION', message: 'No text' }];
    const res = RecommendationEngineV2.generateRecommendations([], [], warnings);
    expect(res[0].type).toBe('parseability');
    expect(res[0].priority).toBe('critical');
  });

  it('2. Generates skill gap recommendation for missing knockout', () => {
    const ko = [{ status: 'MISSING', severity: 'critical', requirement: "Docker", reason: "Missing" }];
    const res = RecommendationEngineV2.generateRecommendations([], ko, []);
    expect(res[0].type).toBe('skill_gap');
    expect(res[0].action).toContain('only if you genuinely have experience using it');
  });

  it('3. Generates evidence strength recommendation for skills-only matches', () => {
    const ev = [{ status: 'MATCHED', evidenceStrength: 'skills', requirement: "React" }];
    const res = RecommendationEngineV2.generateRecommendations(ev, [], []);
    expect(res[0].type).toBe('evidence_strength');
    expect(res[0].reason).toContain('no experience/project evidence was detected');
  });

  it('4. Deduplicates recommendations with identical reasons', () => {
    const ev = [
      { status: 'MATCHED', evidenceStrength: 'skills', requirement: "React" },
      { status: 'MATCHED', evidenceStrength: 'skills', requirement: "React" }
    ];
    const res = RecommendationEngineV2.generateRecommendations(ev, [], []);
    expect(res).toHaveLength(1);
  });
});
