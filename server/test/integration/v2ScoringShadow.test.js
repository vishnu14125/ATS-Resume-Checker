const ScoringEngineV2 = require('../../services/scoring/ScoringEngineV2');
const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/v2/scoring');

describe('ATS V2 Scoring Shadow Integration', () => {
  const getFixture = (filename) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf8'));

  it('1. perfect_match.json -> 58.5 score', () => {
    const fixture = getFixture('perfect_match.json');
    const result = ScoringEngineV2.score(fixture.matches);
    expect(result.overallScore).toBe(fixture.expectedScore);
    expect(result.missingRequirements).toBe(0);
    expect(result.matchedRequirements).toBe(3);
    
    // Check explanation structure
    expect(result.components.requiredSkills.coverage).toBe(1);
    expect(result.components.requiredSkills.contribution).toBe(50);
  });

  it('2. strong_required_match.json -> 50.0 score', () => {
    const fixture = getFixture('strong_required_match.json');
    const result = ScoringEngineV2.score(fixture.matches);
    expect(result.overallScore).toBe(fixture.expectedScore);
    expect(result.missingRequirements).toBe(1); // docker missing
    expect(result.components.preferredSkills.contribution).toBe(0);
  });

  it('3. mixed_required_match.json -> 30.0 score', () => {
    const fixture = getFixture('mixed_required_match.json');
    const result = ScoringEngineV2.score(fixture.matches);
    expect(result.overallScore).toBe(fixture.expectedScore);
    expect(result.knockoutCandidates).toContain('node.js'); // missing required skill
  });

  it('4. preferred_only_match.json -> 10.0 score', () => {
    const fixture = getFixture('preferred_only_match.json');
    const result = ScoringEngineV2.score(fixture.matches);
    expect(result.overallScore).toBe(fixture.expectedScore);
    expect(result.knockoutCandidates).toContain('react');
    expect(result.components.preferredSkills.contribution).toBe(10);
    expect(result.components.requiredSkills.contribution).toBe(0);
  });

  it('5. mostly_missing.json -> 0.0 score', () => {
    const fixture = getFixture('mostly_missing.json');
    const result = ScoringEngineV2.score(fixture.matches);
    expect(result.overallScore).toBe(fixture.expectedScore);
    expect(result.matchedRequirements).toBe(0);
    expect(result.knockoutCandidates).toHaveLength(2);
  });

  it('6. false_positive_case.json -> 0.0 score', () => {
    const fixture = getFixture('false_positive_case.json');
    const result = ScoringEngineV2.score(fixture.matches);
    expect(result.overallScore).toBe(fixture.expectedScore);
    expect(result.knockoutCandidates).toContain('javascript');
  });
});
