const F = require('./helpers/contractFactories');

const { C, clone } = F;

/** Returns the issue messages for an invalid value (and fails if the value is valid). */
function issuesOf(schema, value) {
  const result = schema.safeParse(value);
  expect(result.success).toBe(false);
  return result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('Canonical contracts', () => {
  describe('NormalizedDocument', () => {
    it('accepts a document whose lines preserve @, +, #, % and Unicode dashes', () => {
      const doc = F.normalizedDocument();
      expect(doc.lines[1].text).toContain('@');
      expect(doc.lines[4].text).toContain('–');
      expect(doc.lines[7].text).toContain('C++');
    });

    it('rejects out-of-order line indexes and a lineCount that disagrees with lines', () => {
      const doc = clone(F.normalizedDocument());
      doc.lines[2].index = 7;
      doc.stats.lineCount = 99;
      const issues = issuesOf(C.NormalizedDocumentSchema, doc);
      expect(issues.some((i) => i.startsWith('lines.2.index'))).toBe(true);
      expect(issues.some((i) => i.startsWith('stats.lineCount'))).toBe(true);
    });
  });

  describe('ResumeProfile', () => {
    it('accepts a canonical profile', () => {
      expect(C.ResumeProfileSchema.safeParse(F.resumeProfile()).success).toBe(true);
    });

    it('rejects the legacy V2 parser shape (candidate/allSkills/role) that caused contract drift', () => {
      const legacy = { ...clone(F.resumeProfile()), candidate: { email: 'x@y.z' }, allSkills: [] };
      delete legacy.contact;
      legacy.experience[0].role = 'Backend Engineer';
      const issues = issuesOf(C.ResumeProfileSchema, legacy);
      expect(issues.join('\n')).toMatch(/candidate|allSkills|role/);
      expect(issues.some((i) => i.startsWith('contact'))).toBe(true);
    });

    it('rejects artificial analyzer-only fields such as title/dates strings and rawText', () => {
      const profile = clone(F.resumeProfile());
      profile.experience[0].title = 'Backend Engineer';
      profile.experience[0].dates = '2021 - Present';
      profile.rawText = 'full text';
      const issues = issuesOf(C.ResumeProfileSchema, profile);
      expect(issues.some((i) => i.startsWith('experience.0.title'))).toBe(true);
      expect(issues.some((i) => i.startsWith('experience.0.dates'))).toBe(true);
    });

    it('rejects skill mentions that point at entries or bullets that do not exist', () => {
      const profile = clone(F.resumeProfile());
      profile.skillMentions[0].entryId = 'exp_missing';
      profile.skillMentions[0].bulletId = 'blt_missing';
      const issues = issuesOf(C.ResumeProfileSchema, profile);
      expect(issues).toEqual(expect.arrayContaining([
        expect.stringContaining('unknown entry exp_missing'),
        expect.stringContaining('unknown bullet blt_missing'),
      ]));
    });

    it('rejects invalid emails and inconsistent date precision', () => {
      const profile = clone(F.resumeProfile());
      profile.contact.emails[0].value = 'jane.doe mail.com';
      profile.experience[0].dates.start = { year: 2021, month: 3, precision: 'year' };
      const issues = issuesOf(C.ResumeProfileSchema, profile);
      expect(issues.some((i) => i.startsWith('contact.emails.0.value'))).toBe(true);
      expect(issues.some((i) => i.includes('year precision must not carry a month'))).toBe(true);
    });
  });

  describe('Requirement', () => {
    it('accepts every requirement type with its matching params', () => {
      expect(F.jobProfile().requirements.map((r) => r.type)).toEqual(['skill', 'skill', 'experience_years']);
    });

    it('rejects params whose kind does not match the requirement type', () => {
      const req = { ...clone(F.requirement()), type: 'certification' };
      expect(issuesOf(C.RequirementSchema, req).join()).toMatch(/must equal type "certification"/);
    });

    it('rejects impossible groups and year ranges', () => {
      const group = {
        ...clone(F.requirement()), type: 'skill_group', canonicalKey: 'group:aws|gcp',
        params: { kind: 'skill_group', anyOf: ['aws', 'gcp'], minCount: 3, label: null, categoryId: 'cloud' },
      };
      expect(issuesOf(C.RequirementSchema, group).join()).toMatch(/minCount cannot exceed/);

      const years = {
        ...clone(F.requirement()), type: 'experience_years', canonicalKey: 'years:general',
        params: { kind: 'experience_years', minYears: 5, maxYears: 3, scope: { kind: 'skill', skillIds: [], text: null } },
      };
      const issues = issuesOf(C.RequirementSchema, years).join('\n');
      expect(issues).toMatch(/maxYears must be >= minYears/);
      expect(issues).toMatch(/need at least one skillId/);
    });

    it('rejects random or unprefixed ids and requirements without a source statement', () => {
      const req = { ...clone(F.requirement()), id: 'a1b2c3', sourceStatementIds: [] };
      const issues = issuesOf(C.RequirementSchema, req);
      expect(issues.some((i) => i.startsWith('id'))).toBe(true);
      expect(issues.some((i) => i.startsWith('sourceStatementIds'))).toBe(true);
    });
  });

  describe('JobProfile', () => {
    it('rejects requirements that reference unknown statements or duplicate a canonical key', () => {
      const job = clone(F.jobProfile());
      job.requirements[1].sourceStatementIds = ['stm_404'];
      job.requirements[1].canonicalKey = 'skill:docker';
      const issues = issuesOf(C.JobProfileSchema, job).join('\n');
      expect(issues).toMatch(/unknown statement stm_404/);
      expect(issues).toMatch(/duplicate canonicalKey skill:docker/);
    });
  });

  describe('MatchResult and RequirementAssessment', () => {
    it('requires implied matches to name the taxonomy relation and semantic matches to carry similarity details', () => {
      expect(issuesOf(C.MatchResultSchema, { ...clone(F.matchResult()), method: 'implied' }).join()).toMatch(/must describe the taxonomy relation/);
      expect(issuesOf(C.MatchResultSchema, { ...clone(F.matchResult()), method: 'semantic' }).join()).toMatch(/must include similarity details/);
    });

    it('accepts a semantic match (the legacy schema rejected "semantic" and would have crashed the pipeline)', () => {
      const semantic = {
        ...clone(F.matchResult()), method: 'semantic', matchedSkillId: null,
        semantic: { model: 'test-model', similarity: 0.8, threshold: 0.7, band: 'strong', calibrationId: 'cal_1' },
      };
      expect(C.MatchResultSchema.safeParse(semantic).success).toBe(true);
    });

    it('rejects a match without evidence', () => {
      expect(issuesOf(C.MatchResultSchema, { ...clone(F.matchResult()), evidenceIds: [] }).join()).toMatch(/evidenceIds/);
    });

    it('rejects "met" without a best match and "missing" with credit', () => {
      const [met] = clone(F.assessments());
      expect(issuesOf(C.RequirementAssessmentSchema, { ...met, best: null }).join()).toMatch(/must reference its best match/);
      expect(issuesOf(C.RequirementAssessmentSchema, { ...met, status: 'missing', best: null, credit: 0.5 }).join()).toMatch(/must have credit 0/);
    });
  });

  describe('Evidence', () => {
    it('rejects evidence without line references or with an oversized snippet', () => {
      const ev = { ...clone(F.evidence()), refs: [], snippet: 'x'.repeat(301) };
      const issues = issuesOf(C.EvidenceSchema, ev);
      expect(issues.some((i) => i.startsWith('refs'))).toBe(true);
      expect(issues.some((i) => i.startsWith('snippet'))).toBe(true);
    });
  });

  describe('Eligibility', () => {
    it('derives the status from findings', () => {
      expect(F.eligibility([F.knockout()]).status).toBe('clear');
      expect(F.eligibility([F.knockout({ outcome: 'failed' })]).status).toBe('likely_filtered');
      expect(F.eligibility([F.knockout({ outcome: 'unknown' })]).status).toBe('review');
      expect(F.eligibility([F.knockout({ outcome: 'failed', severity: 'high' })]).status).toBe('review');
    });

    it('rejects a status that contradicts the findings, and a non-clear status without reasons', () => {
      const failed = F.knockout({ outcome: 'failed' });
      expect(issuesOf(C.EligibilitySchema, { status: 'clear', reasons: [], findings: [failed] }).join()).toMatch(/must be "likely_filtered"/);
      expect(issuesOf(C.EligibilitySchema, { status: 'likely_filtered', reasons: [], findings: [failed] }).join()).toMatch(/explain its reasons/);
    });
  });

  describe('ScoreBreakdown', () => {
    it('accepts explainable scores whose deductions account for every lost point', () => {
      const score = F.jobMatchScore();
      const lost = score.deductions.reduce((s, d) => s + d.pointsLost, 0);
      expect(score.score + lost).toBeCloseTo(100, 1);
      expect(F.resumeHealthScore().score).toBe(80);
    });

    it('rejects free points for a component that does not apply (the legacy "no_requirements" behaviour)', () => {
      const score = clone(F.jobMatchScore());
      score.components[2] = { ...score.components[2], effectiveWeight: 0.1, contribution: 10, maxContribution: 10 };
      expect(issuesOf(C.ScoreBreakdownSchema, score).join()).toMatch(/carries no weight or points/);
    });

    it('rejects a score that deductions do not reconcile to 100', () => {
      const score = clone(F.jobMatchScore());
      score.deductions[0].pointsLost = 1;
      expect(issuesOf(C.ScoreBreakdownSchema, score).join()).toMatch(/must equal 100/);
    });

    it('rejects components that belong to the other score kind', () => {
      const score = { ...clone(F.resumeHealthScore()), kind: 'job_match' };
      expect(issuesOf(C.ScoreBreakdownSchema, score).join()).toMatch(/"parseability" is not a job_match component/);
    });

    it('accepts a null score only with a reason and nothing evaluated', () => {
      const base = clone(F.jobMatchScore());
      const empty = {
        ...base, score: null, scoreReason: 'No requirements were identified in this job description.', deductions: [],
        components: [{ ...base.components[2] }],
      };
      expect(C.ScoreBreakdownSchema.safeParse(empty).success).toBe(true);
      expect(issuesOf(C.ScoreBreakdownSchema, { ...empty, scoreReason: null }).join()).toMatch(/must explain why/);
    });
  });

  describe('Recommendation', () => {
    it('rejects resume-scope recommendations that reference job requirements or claim job-match impact', () => {
      const rec = clone(F.recommendation());
      rec.requirementIds = ['req_docker'];
      rec.expectedImpact.scoreKind = 'job_match';
      const issues = issuesOf(C.RecommendationSchema, rec).join('\n');
      expect(issues).toMatch(/cannot reference job requirements/);
      expect(issues).toMatch(/cannot claim job-match impact/);
    });
  });

  describe('AnalysisResult — optional job description', () => {
    it('accepts a resume-only analysis (no job is a valid state)', () => {
      const result = F.resumeOnlyResult();
      expect(result.mode).toBe('resume_only');
      expect(result.job).toBeNull();
      expect(result.jobMatch).toBeNull();
      expect(result.resumeHealth.score.kind).toBe('resume_health');
    });

    it('accepts a resume + job analysis that includes both resume health and job match', () => {
      const result = F.jobMatchResult();
      expect(result.mode).toBe('job_match');
      expect(result.resumeHealth.score.score).toBe(80);
      expect(result.jobMatch.score.score).toBe(91.4);
      expect(result.jobMatch.assessments).toHaveLength(result.jobMatch.requirements.length);
    });

    it('rejects a resume-only analysis that carries job data or job-scoped recommendations', () => {
      const withJob = { ...clone(F.resumeOnlyResult()), job: clone(F.jobMatchResult()).job };
      expect(C.AnalysisResultSchema.safeParse(withJob).success).toBe(false);

      const jobRec = clone(F.resumeOnlyResult());
      jobRec.recommendations.push(clone(F.jobMatchResult()).recommendations[1]);
      expect(issuesOf(C.AnalysisResultSchema, jobRec).join('\n')).toMatch(/require a job/);
    });

    it('rejects a job-match analysis without its job report', () => {
      const result = { ...clone(F.jobMatchResult()), jobMatch: null };
      expect(C.AnalysisResultSchema.safeParse(result).success).toBe(false);
    });

    it('rejects unassessed or doubly assessed requirements', () => {
      const missing = clone(F.jobMatchResult());
      missing.jobMatch.assessments.pop();
      expect(issuesOf(C.AnalysisResultSchema, missing).join()).toMatch(/req_years has no assessment/);

      const doubled = clone(F.jobMatchResult());
      doubled.jobMatch.assessments.push(clone(doubled.jobMatch.assessments[0]));
      expect(issuesOf(C.AnalysisResultSchema, doubled).join()).toMatch(/assessed more than once/);
    });

    it('rejects references to evidence, requirements or findings that do not exist', () => {
      const result = clone(F.jobMatchResult());
      result.jobMatch.assessments[0].best.evidenceIds = ['ev_ghost'];
      result.recommendations[1].requirementIds = ['req_ghost'];
      result.recommendations[0].findingIds = ['fnd_ghost'];
      const issues = issuesOf(C.AnalysisResultSchema, result).join('\n');
      expect(issues).toMatch(/unknown evidence id ev_ghost/);
      expect(issues).toMatch(/unknown requirement id req_ghost/);
      expect(issues).toMatch(/unknown finding id fnd_ghost/);
    });

    it('requires engine.jobParserVersion exactly when a job was analyzed', () => {
      const result = clone(F.resumeOnlyResult());
      result.engine.jobParserVersion = '1.0.0';
      expect(issuesOf(C.AnalysisResultSchema, result).join()).toMatch(/jobParserVersion must be set exactly when/);
    });
  });

  describe('AnalysisRequest — optional job description', () => {
    const resumeVersionId = F.RESUME_VERSION_ID;

    it('resolves resume-only when no job is supplied', () => {
      const request = C.AnalysisRequestSchema.parse({ resumeVersionId });
      expect(C.resolveAnalysisMode(request)).toBe('resume_only');
    });

    it('resolves job_match for a stored job id or inline job text', () => {
      expect(C.resolveAnalysisMode(C.AnalysisRequestSchema.parse({ resumeVersionId, jobId: F.JOB_ID }))).toBe('job_match');
      const inline = C.AnalysisRequestSchema.parse({ resumeVersionId, job: { text: '  Requirements:\n- Docker  ' } });
      expect(C.resolveAnalysisMode(inline)).toBe('job_match');
      expect(inline.job.text).toBe('Requirements:\n- Docker'); // trimmed, line breaks preserved
    });

    it('rejects both job forms together, empty or oversized job text, and unknown keys', () => {
      expect(issuesOf(C.AnalysisRequestSchema, { resumeVersionId, jobId: F.JOB_ID, job: { text: 'x' } }).join()).toMatch(/either jobId or job/);
      expect(C.AnalysisRequestSchema.safeParse({ resumeVersionId, job: { text: '   ' } }).success).toBe(false);
      expect(C.AnalysisRequestSchema.safeParse({ resumeVersionId, job: { text: 'x'.repeat(C.JOB_TEXT_MAX_CHARS + 1) } }).success).toBe(false);
      expect(C.AnalysisRequestSchema.safeParse({ resumeVersionId, userId: 'someone-else' }).success).toBe(false);
    });
  });

  describe('Boundary helpers', () => {
    it('parseContract returns the validated value and throws a typed error with issues', () => {
      const parsed = C.parseContract(C.AnalysisRequestSchema, { resumeVersionId: F.RESUME_VERSION_ID, job: { text: '  JD  ' } }, 'AnalysisRequest');
      expect(parsed.job.text).toBe('JD');
      expect(() => C.parseContract(C.EvidenceSchema, {}, 'Evidence')).toThrow(C.ContractViolationError);
      try {
        C.parseContract(C.EvidenceSchema, {}, 'Evidence');
      } catch (err) {
        expect(err.contractName).toBe('Evidence');
        expect(err.issues.length).toBeGreaterThan(0);
      }
    });

    it('exports strict JSON Schema for use as LLM structured output and API documentation', () => {
      const schema = C.toJsonSchema(C.RequirementSchema);
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required).toEqual(expect.arrayContaining(['id', 'type', 'params', 'sourceText']));
      expect(() => C.toJsonSchema(C.AnalysisResultSchema)).not.toThrow();
    });
  });
});
