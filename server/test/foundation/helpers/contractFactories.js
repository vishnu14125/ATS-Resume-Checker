/**
 * Builders for canonical contracts. Every builder output is parsed by its strict
 * schema before being returned, so a test can never use an object that the
 * contract (and therefore the real producer) would reject.
 */
const C = require('../../../src/domain/contracts');

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const RESUME_VERSION_ID = '64b7f0c2a1b2c3d4e5f60718';
const JOB_ID = '64b7f0c2a1b2c3d4e5f60719';

const clone = (value) => JSON.parse(JSON.stringify(value));
const ref = (lineIndex, start = null, end = null) => ({ lineIndex, start, end });
const built = (schema, value, name) => C.parseContract(schema, value, name);

function line(index, text, { isBullet = false } = {}) {
  return {
    index, text, original: isBullet ? `• ${text}` : text, page: 1, isBullet,
    bulletGlyph: isBullet ? '•' : null, indentLevel: isBullet ? 1 : null,
    style: { fontSize: null, bold: null, allCaps: text === text.toUpperCase() },
    blankLineBefore: false,
  };
}

function normalizedDocument() {
  const lines = [
    line(0, 'Jane Doe'),
    line(1, 'jane.doe@example.com | +1 555 010 0100'),
    line(2, 'EXPERIENCE'),
    line(3, 'Backend Engineer, Acme Corp'),
    line(4, 'Jan 2021 – Present'),
    line(5, 'Built REST APIs in Node.js serving 2M requests/day, cutting latency 35%', { isBullet: true }),
    line(6, 'SKILLS'),
    line(7, 'Node.js, React, Docker, C++, C#'),
  ];
  return built(C.NormalizedDocumentSchema, {
    schemaVersion: '1',
    source: { kind: 'pdf', extractor: 'test', extractorVersion: '0.0.0', pageCount: 1 },
    lines,
    links: [],
    layout: { multiColumnSuspected: false, tableCount: 0, headerFooterLineIndexes: [] },
    stats: { charCount: 200, wordCount: 30, lineCount: lines.length, nonAsciiRatio: 0.01, replacementCharCount: 0, privateUseCharCount: 0 },
    warnings: [],
    textHash: SHA_A,
  }, 'NormalizedDocument');
}

function resumeProfile() {
  return built(C.ResumeProfileSchema, {
    schemaVersion: '1',
    parserVersion: '0.0.0-test',
    contact: {
      name: { value: 'Jane Doe', ref: ref(0), confidence: 0.8 },
      emails: [{ value: 'jane.doe@example.com', ref: ref(1, 0, 20), confidence: 1 }],
      phones: [{ value: '+1 555 010 0100', ref: ref(1, 23, 38), confidence: 0.9 }],
      location: null,
      links: [],
    },
    sections: [
      { id: 'sec_exp', type: 'experience', heading: 'EXPERIENCE', startLine: 2, endLine: 5, confidence: 0.95 },
      { id: 'sec_skl', type: 'skills', heading: 'SKILLS', startLine: 6, endLine: 7, confidence: 0.95 },
    ],
    summary: null,
    experience: [{
      id: 'exp_1',
      title: { value: 'Backend Engineer', ref: ref(3, 0, 16), confidence: 0.9 },
      organization: { value: 'Acme Corp', ref: ref(3, 18, 27), confidence: 0.9 },
      location: null,
      employmentType: 'full_time',
      dates: {
        start: { year: 2021, month: 1, precision: 'month' }, end: null, isCurrent: true,
        sourceText: 'Jan 2021 – Present', duration: { minMonths: 68, bestMonths: 68, maxMonths: 68 },
      },
      headerRefs: [ref(3), ref(4)],
      bullets: [{
        id: 'blt_1', ref: ref(5), text: 'Built REST APIs in Node.js serving 2M requests/day, cutting latency 35%',
        actionVerb: 'build', metrics: [{ raw: '2M', kind: 'count' }, { raw: '35%', kind: 'percent' }], skillIds: ['node.js'],
      }],
      descriptionRefs: [],
      skillIds: ['node.js'],
    }],
    projects: [],
    education: [],
    certifications: [],
    skillMentions: [
      { skillId: 'node.js', surface: 'Node.js', ref: ref(5, 19, 26), section: 'experience', entryId: 'exp_1', bulletId: 'blt_1', recognition: 'canonical', ambiguous: false, confidence: 1 },
      { skillId: 'docker', surface: 'Docker', ref: ref(7, 16, 22), section: 'skills', entryId: null, bulletId: null, recognition: 'canonical', ambiguous: false, confidence: 1 },
      { skillId: 'c++', surface: 'C++', ref: ref(7, 24, 27), section: 'skills', entryId: null, bulletId: null, recognition: 'canonical', ambiguous: false, confidence: 1 },
    ],
    skillsSection: [
      { raw: 'Node.js', skillId: 'node.js', ref: ref(7) },
      { raw: 'Docker', skillId: 'docker', ref: ref(7) },
      { raw: 'C#', skillId: 'c#', ref: ref(7) },
    ],
    achievements: [],
    languages: [],
    totals: { professionalMonths: { minMonths: 68, bestMonths: 68, maxMonths: 68 }, internshipMonths: null },
    diagnostics: { unassignedLineCount: 0, warnings: [] },
  }, 'ResumeProfile');
}

function requirement(overrides = {}) {
  return built(C.RequirementSchema, {
    id: 'req_docker',
    type: 'skill',
    canonicalKey: 'skill:docker',
    displayName: 'Docker',
    category: 'devops',
    importance: 'required',
    importanceReason: "Under heading 'Requirements'",
    isHardConstraint: false,
    params: { kind: 'skill', skillId: 'docker' },
    sourceStatementIds: ['stm_1'],
    sourceText: 'Experience with Docker and Node.js',
    extractedBy: 'rules',
    confidence: 0.95,
    ...overrides,
  }, 'Requirement');
}

function jobProfile() {
  return built(C.JobProfileSchema, {
    schemaVersion: '1',
    parserVersion: '0.0.0-test',
    title: { value: 'Backend Engineer', ref: ref(0), confidence: 0.9 },
    company: null,
    seniority: { level: 'mid', basis: 'years', confidence: 0.7 },
    location: { raw: 'Remote', workMode: 'remote', ref: ref(1) },
    employmentType: 'full_time',
    sections: [{ id: 'sec_req', type: 'requirements', heading: 'Requirements', startLine: 2, endLine: 4 }],
    statements: [
      { id: 'stm_1', section: 'requirements', text: 'Experience with Docker and Node.js', refs: [ref(3)] },
      { id: 'stm_2', section: 'requirements', text: '3+ years of backend experience', refs: [ref(4)] },
    ],
    requirements: [
      requirement(),
      requirement({ id: 'req_node', canonicalKey: 'skill:node.js', displayName: 'Node.js', category: 'backend', params: { kind: 'skill', skillId: 'node.js' } }),
      requirement({
        id: 'req_years', type: 'experience_years', canonicalKey: 'years:general', displayName: '3+ years of backend experience',
        category: null, isHardConstraint: true, sourceStatementIds: ['stm_2'], sourceText: '3+ years of backend experience',
        params: { kind: 'experience_years', minYears: 3, maxYears: null, scope: { kind: 'general', skillIds: [], text: 'backend' } },
      }),
    ],
    softSkills: [],
    interpretation: { rulesVersion: '0.0.0', ai: { status: 'not_requested', model: null, promptVersion: null, proposedCount: 0, acceptedCount: 0 } },
    revision: 1,
    diagnostics: { unclassifiedStatementIds: [], warnings: [] },
  }, 'JobProfile');
}

function evidence(overrides = {}) {
  return built(C.EvidenceSchema, {
    id: 'ev_bullet1', kind: 'bullet', section: 'experience', entryId: 'exp_1', refs: [ref(5)],
    snippet: 'Built REST APIs in Node.js serving 2M requests/day, cutting latency 35%',
    skillIds: ['node.js'], dates: null, strength: 'strong', strengthFactors: ['applied_in_role', 'quantified_outcome', 'recent'],
    ...overrides,
  }, 'Evidence');
}

const skillsEvidence = () => evidence({
  id: 'ev_skills', kind: 'skills_list', section: 'skills', entryId: null, refs: [ref(7)],
  snippet: 'Node.js, React, Docker, C++, C#', skillIds: ['node.js', 'react', 'docker', 'c++', 'c#'], strength: 'weak', strengthFactors: ['listed_only'],
});

function matchResult(overrides = {}) {
  return built(C.MatchResultSchema, {
    method: 'exact', matchedSkillId: 'node.js', relation: null, semantic: null, evidenceIds: ['ev_bullet1'],
    strength: 'strong', methodFactor: 1, strengthFactor: 1, confidence: 0.98,
    explanation: 'Found "Node.js" in experience.', ...overrides,
  }, 'MatchResult');
}

function assessments() {
  return [
    { requirementId: 'req_node', status: 'met', statusReason: 'Found in an experience bullet', credit: 1, best: matchResult(), alternatives: [], details: { kind: 'none' }, confidence: 0.98 },
    {
      requirementId: 'req_docker', status: 'met', statusReason: 'Listed only in the skills section', credit: 0.75,
      best: matchResult({ matchedSkillId: 'docker', evidenceIds: ['ev_skills'], strength: 'weak', strengthFactor: 0.75, explanation: 'Found "Docker" in the skills list.' }),
      alternatives: [], details: { kind: 'none' }, confidence: 0.9,
    },
    {
      requirementId: 'req_years', status: 'met', statusReason: 'About 5.7 years of dated experience', credit: 1,
      best: matchResult({ matchedSkillId: null, explanation: 'Dated roles total 68 months.' }), alternatives: [],
      details: { kind: 'years', requiredMonths: 36, demonstrated: { minMonths: 68, bestMonths: 68, maxMonths: 68 }, contributingEntryIds: ['exp_1'], basis: 'total_experience' },
      confidence: 0.95,
    },
  ].map((a) => built(C.RequirementAssessmentSchema, a, 'RequirementAssessment'));
}

function eligibility(findings = []) {
  const status = C.deriveEligibilityStatus(findings);
  return built(C.EligibilitySchema, { status, reasons: status === 'clear' ? [] : ['See findings'], findings }, 'Eligibility');
}

function knockout(overrides = {}) {
  return {
    id: 'ko_years', requirementId: 'req_years', kind: 'years_experience', severity: 'critical', outcome: 'passed',
    evidenceIds: ['ev_bullet1'], explanation: 'Dated roles total 68 months against a 36-month minimum.', confidence: 0.95, ...overrides,
  };
}

/** Job match: two evaluated components (required skills 0.45, experience 0.20 → renormalized), one not applicable. */
function jobMatchScore() {
  const wReq = 0.45 / 0.65;
  const wExp = 0.2 / 0.65;
  const reqItems = [
    { subjectId: 'req_node', itemWeight: 1, credit: 1, pointsLost: 0 },
    { subjectId: 'req_docker', itemWeight: 1, credit: 0.75, pointsLost: round2((wReq * 100 * 0.25) / 2) },
  ];
  const reqRaw = (1 + 0.75) / 2; // Node.js (strong) + Docker (weak evidence); years are scored under experience
  const reqContribution = round2(wReq * reqRaw * 100);
  const expContribution = round2(wExp * 100);
  const score = round1(reqContribution + expContribution);
  return built(C.ScoreBreakdownSchema, {
    kind: 'job_match',
    scoringModelVersion: '0.0.0-test',
    score,
    scoreReason: null,
    confidence: { label: 'medium', reasons: ['Only 3 requirements were extracted'] },
    components: [
      { id: 'required_skills', status: 'evaluated', statusReason: '2 required skills', baseWeight: 0.45, effectiveWeight: wReq, rawScore: reqRaw, contribution: reqContribution, maxContribution: wReq * 100, items: reqItems, confidence: 0.9 },
      { id: 'experience', status: 'evaluated', statusReason: '1 years requirement', baseWeight: 0.2, effectiveWeight: wExp, rawScore: 1, contribution: expContribution, maxContribution: wExp * 100, items: [{ subjectId: 'req_years', itemWeight: 1, credit: 1, pointsLost: 0 }], confidence: 0.95 },
      { id: 'education', status: 'not_applicable', statusReason: 'The job has no education requirement', baseWeight: 0.1, effectiveWeight: 0, rawScore: null, contribution: 0, maxContribution: 0, items: [], confidence: 1 },
    ],
    deductions: [{ componentId: 'required_skills', subjectId: 'req_docker', pointsLost: round2(100 - score), cause: 'weak_evidence', message: 'Docker appears only in the skills list.' }],
  }, 'ScoreBreakdown');
}

/** Resume health: parseability 0.6 × 1.0 + technical content 0.4 × 0.5 = 80. */
function resumeHealthScore() {
  return built(C.ScoreBreakdownSchema, {
    kind: 'resume_health',
    scoringModelVersion: '0.0.0-test',
    score: 80,
    scoreReason: null,
    confidence: { label: 'high', reasons: [] },
    components: [
      { id: 'parseability', status: 'evaluated', statusReason: 'All checks passed', baseWeight: 0.6, effectiveWeight: 0.6, rawScore: 1, contribution: 60, maxContribution: 60, items: [{ subjectId: 'chk_email', itemWeight: 1, credit: 1, pointsLost: 0 }], confidence: 0.95 },
      { id: 'technical_content', status: 'evaluated', statusReason: 'One content finding', baseWeight: 0.4, effectiveWeight: 0.4, rawScore: 0.5, contribution: 20, maxContribution: 40, items: [{ subjectId: 'fnd_skills', itemWeight: 1, credit: 0.5, pointsLost: 20 }], confidence: 0.8 },
    ],
    deductions: [{ componentId: 'technical_content', subjectId: 'fnd_skills', pointsLost: 20, cause: 'warning_check', message: 'Most skills are listed without supporting bullets.' }],
  }, 'ScoreBreakdown');
}

function resumeHealth() {
  return built(C.ResumeHealthReportSchema, {
    version: '0.0.0-test',
    sourceKind: 'pdf',
    readability: 'good',
    checks: [{ id: 'chk_email', checkId: 'contact_email', result: 'pass', evidence: 'Email found on line 2', fix: null, refs: [ref(1, 0, 20)] }],
    findings: [{
      id: 'fnd_skills', ruleId: 'Q-SKILLS-UNSUPPORTED', area: 'technical_content', severity: 'medium',
      message: 'Several skills are listed without supporting bullets.', suggestion: 'Show where you used them in a role or project.',
      refs: [ref(7)], evidenceIds: ['ev_skills'],
    }],
    score: resumeHealthScore(),
    limitations: ['Layout checks are based on text positions, not rendered appearance.'],
  }, 'ResumeHealthReport');
}

function recommendation(overrides = {}) {
  return built(C.RecommendationSchema, {
    id: 'rec_skills', ruleId: 'REC-SKILLS-UNSUPPORTED', scope: 'resume', priority: 'medium', category: 'technical_content',
    issue: 'Skills are listed without evidence.', action: 'Add a bullet showing how you used Docker.', rationale: 'Recruiters look for applied skills.',
    requirementIds: [], evidenceIds: ['ev_skills'], findingIds: ['fnd_skills'],
    expectedImpact: { scoreDelta: 20, scoreKind: 'resume_health', description: 'Up to +20 resume health points' },
    integrityNote: 'Only add this if it is true.', confidence: 0.8, ...overrides,
  }, 'Recommendation');
}

const engine = (jobParserVersion) => ({
  version: '0.0.0-test', parserVersion: '0.0.0-test', taxonomyVersion: '2026.0.0', scoringModelVersion: '0.0.0-test',
  recommendationsVersion: '0.0.0-test', jobParserVersion,
});

function resumeOnlyResult() {
  return built(C.AnalysisResultSchema, {
    schemaVersion: '1',
    mode: 'resume_only',
    engine: engine(null),
    referenceDate: '2026-09-29',
    resume: { resumeVersionId: RESUME_VERSION_ID, resumeTextHash: SHA_A },
    job: null,
    jobMatch: null,
    evidence: [evidence(), skillsEvidence()],
    resumeHealth: resumeHealth(),
    recommendations: [recommendation()],
    diagnostics: { timingsMs: { parse: 4 }, warnings: [] },
  }, 'AnalysisResult');
}

function jobMatchResult() {
  return built(C.AnalysisResultSchema, {
    ...clone(resumeOnlyResult()),
    mode: 'job_match',
    engine: engine('0.0.0-test'),
    job: { jobId: JOB_ID, jobTextHash: SHA_B, jobProfileRevision: 1 },
    jobMatch: {
      requirements: jobProfile().requirements,
      assessments: assessments(),
      eligibility: eligibility([knockout()]),
      score: jobMatchScore(),
      keywordCoverage: { required: 1, preferred: null },
      projectRelevance: [],
    },
    recommendations: [
      recommendation(),
      recommendation({
        id: 'rec_docker', ruleId: 'REC-SKILL-WEAK-EVIDENCE', scope: 'job', category: 'skills', requirementIds: ['req_docker'],
        findingIds: [], expectedImpact: { scoreDelta: 8.6, scoreKind: 'job_match', description: 'Up to +8.6 job match points' },
      }),
    ],
  }, 'AnalysisResult');
}

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }

module.exports = {
  C, clone, ref, SHA_A, SHA_B, RESUME_VERSION_ID, JOB_ID,
  normalizedDocument, resumeProfile, requirement, jobProfile, evidence, skillsEvidence, matchResult, assessments,
  eligibility, knockout, jobMatchScore, resumeHealthScore, resumeHealth, recommendation, resumeOnlyResult, jobMatchResult,
};
