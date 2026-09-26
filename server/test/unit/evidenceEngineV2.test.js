const EvidenceEngineV2 = require('../../services/evidence/EvidenceEngineV2');

describe('EvidenceEngineV2', () => {
  it('1. Generates expected structured records for explicit exact matches', () => {
    const jd = [{ canonical: "react", required: true, category: "skill" }];
    const matches = [{ requirementCanonical: "react", matchType: "exact", resumeSection: "experience", resumeEvidence: "React Dev", sourceId: "exp-1" }];
    
    const res = EvidenceEngineV2.generateEvidence(jd, matches);
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe('MATCHED');
    expect(res[0].evidenceStrength).toBe('experience');
    expect(res[0].matchType).toBe('exact');
  });

  it('2. Marks requirements as MISSING if no matches found', () => {
    const jd = [{ canonical: "docker", required: true, category: "skill" }];
    const matches = [];
    const res = EvidenceEngineV2.generateEvidence(jd, matches);
    expect(res[0].status).toBe('MISSING');
    expect(res[0].matchType).toBe('missing');
  });

  it('3. Respects partial context from experience analyzer', () => {
    const jd = [{ canonical: "react", required: true, category: "experience" }];
    const matches = [{ requirementCanonical: "react", matchType: "exact", resumeSection: "experience" }];
    const intelContext = { experience: [{ canonicalSkill: "react", durationStatus: "partial" }] };
    
    const res = EvidenceEngineV2.generateEvidence(jd, matches, intelContext);
    expect(res[0].status).toBe('PARTIAL');
  });

  it('4. Respects missing context from education/certification analyzer', () => {
    const jd = [{ canonical: "bachelors", required: true, category: "education" }];
    const matches = [{ requirementCanonical: "bachelors", matchType: "alias", resumeSection: "education" }];
    const intelContext = { education: [{ canonicalReq: "bachelors", status: "missing" }] };
    
    const res = EvidenceEngineV2.generateEvidence(jd, matches, intelContext);
    expect(res[0].status).toBe('MISSING');
  });

  it('5. Prioritizes highest evidence strength', () => {
    const jd = [{ canonical: "node", required: true, category: "skill" }];
    const matches = [
      { requirementCanonical: "node", matchType: "exact", resumeSection: "skills" },
      { requirementCanonical: "node", matchType: "exact", resumeSection: "experience" }
    ];
    
    const res = EvidenceEngineV2.generateEvidence(jd, matches);
    expect(res[0].evidenceStrength).toBe('experience'); // experience > skills
  });
});
