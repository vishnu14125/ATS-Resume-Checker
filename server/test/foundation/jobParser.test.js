const { ingestPastedText } = require('../../src/documents/ingest');
const { parseJob } = require('../../src/engine/job/parseJob');
const { JobProfileSchema } = require('../../src/domain/contracts/jobProfile');
const { readJdText } = require('./helpers/fixtures');

async function parseFixture(name) {
  return parseJob(await ingestPastedText(readJdText(name)));
}

const req = (profile, pred) => profile.requirements.filter(pred);
const skillKeys = (profile) => new Set(req(profile, (r) => r.type === 'skill').map((r) => r.params.skillId));
const importanceOf = (profile, skillId) => {
  const r = profile.requirements.find((x) => x.canonicalKey === `skill:${skillId}`);
  return r ? r.importance : null;
};

describe('JD parser — Software Engineer (required vs preferred)', () => {
  let profile;
  beforeAll(async () => { profile = await parseFixture('software_engineer.txt'); });

  it('passes the JobProfile contract', () => {
    expect(JobProfileSchema.safeParse(profile).success).toBe(true);
  });

  it('extracts the title and classifies required vs preferred skills', () => {
    expect(profile.title.value).toBe('Software Engineer');
    expect(importanceOf(profile, 'javascript')).toBe('required');
    expect(importanceOf(profile, 'react')).toBe('required');
    expect(importanceOf(profile, 'node.js')).toBe('required');
    expect(importanceOf(profile, 'docker')).toBe('preferred');
    expect(importanceOf(profile, 'aws')).toBe('preferred');
  });

  it('extracts a 2+ years experience requirement as a hard constraint', () => {
    const years = req(profile, (r) => r.type === 'experience_years')[0];
    expect(years.params.minYears).toBe(2);
    expect(years.importance).toBe('required');
    expect(years.isHardConstraint).toBe(true);
  });

  it('does not turn benefits into requirements', () => {
    expect(profile.requirements.some((r) => /salary|insurance|401/i.test(r.displayName))).toBe(false);
  });

  it('every requirement references a real source statement', () => {
    const statementIds = new Set(profile.statements.map((s) => s.id));
    for (const r of profile.requirements) {
      expect(r.sourceStatementIds.length).toBeGreaterThan(0);
      for (const sid of r.sourceStatementIds) expect(statementIds.has(sid)).toBe(true);
    }
  });
});

describe('JD parser — Frontend Developer', () => {
  let profile;
  beforeAll(async () => { profile = await parseFixture('frontend_developer.txt'); });

  it('captures core frontend skills and hybrid work mode', () => {
    expect(JobProfileSchema.safeParse(profile).success).toBe(true);
    const skills = skillKeys(profile);
    expect(skills).toEqual(expect.anything());
    for (const s of ['react', 'typescript', 'html', 'css', 'jest', 'cypress']) expect(skills.has(s)).toBe(true);
    expect(profile.location.workMode).toBe('hybrid');
    expect(importanceOf(profile, 'next.js')).toBe('preferred');
  });
});

describe('JD parser — Backend Developer (explicit must-have cues)', () => {
  let profile;
  beforeAll(async () => { profile = await parseFixture('backend_developer.txt'); });

  it('marks must-have skills required and hard, captures REST/SQL/PostgreSQL', () => {
    expect(JobProfileSchema.safeParse(profile).success).toBe(true);
    const node = profile.requirements.find((r) => r.canonicalKey === 'skill:node.js');
    expect(node.importance).toBe('required');
    expect(node.isHardConstraint).toBe(true);
    const skills = skillKeys(profile);
    for (const s of ['node.js', 'rest', 'sql', 'postgresql']) expect(skills.has(s)).toBe(true);
    expect(importanceOf(profile, 'redis')).toBe('preferred');
  });

  it('reads the company from "Backend Developer at DataForge"', () => {
    expect(profile.company.value).toBe('DataForge');
  });
});

describe('JD parser — ambiguous JD (no fabrication)', () => {
  let profile;
  beforeAll(async () => { profile = await parseFixture('ambiguous.txt'); });

  it('passes the contract and does not invent concrete requirements', () => {
    expect(JobProfileSchema.safeParse(profile).success).toBe(true);
    expect(req(profile, (r) => r.type === 'experience_years')).toHaveLength(0);
    expect(req(profile, (r) => r.type === 'education')).toHaveLength(0);
    expect(req(profile, (r) => r.type === 'certification')).toHaveLength(0);
    // No company inferred from prose, and a warning records the lack of skills/requirements.
    expect(profile.company).toBeNull();
    expect(profile.diagnostics.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['NO_SKILLS']));
  });
});

describe('JD parser — education, certification, experience, eligibility', () => {
  let profile;
  beforeAll(async () => { profile = await parseFixture('education_cert.txt'); });

  it('extracts a required degree with field and related-field acceptance', () => {
    expect(JobProfileSchema.safeParse(profile).success).toBe(true);
    const edu = req(profile, (r) => r.type === 'education')[0];
    expect(edu.params.minLevel).toBe('bachelor');
    expect(edu.params.fieldIds).toContain('computer_science');
    expect(edu.params.relatedFieldsAccepted).toBe(true);
    expect(edu.importance).toBe('required');
    expect(edu.isHardConstraint).toBe(true);
  });

  it('extracts required and preferred certifications and a minimum-years requirement', () => {
    const certs = req(profile, (r) => r.type === 'certification');
    expect(certs.length).toBeGreaterThanOrEqual(1);
    const years = req(profile, (r) => r.type === 'experience_years')[0];
    expect(years.params.minYears).toBe(4);
    const masters = profile.requirements.find((r) => r.type === 'education' && r.params.minLevel === 'master');
    expect(masters.importance).toBe('preferred');
  });

  it('captures work authorization and language as eligibility requirements', () => {
    expect(req(profile, (r) => r.type === 'work_authorization').length).toBe(1);
    const lang = req(profile, (r) => r.type === 'language')[0];
    expect(lang.params.language).toBe('Spanish');
  });
});

describe('JD parser — responsibilities-heavy JD', () => {
  let profile;
  beforeAll(async () => { profile = await parseFixture('responsibilities_heavy.txt'); });

  it('extracts multiple responsibilities with source references', () => {
    expect(JobProfileSchema.safeParse(profile).success).toBe(true);
    const responsibilities = req(profile, (r) => r.type === 'responsibility');
    expect(responsibilities.length).toBeGreaterThanOrEqual(5);
    responsibilities.forEach((r) => expect(r.isHardConstraint).toBe(false));
  });
});

describe('JD parser — dangerous technology names stay distinct', () => {
  let profile;
  let skills;
  beforeAll(async () => { profile = await parseFixture('dangerous_tokens.txt'); skills = skillKeys(profile); });

  it('keeps Java vs JavaScript, C vs C++ vs C#, React vs React Native, Node vs Node.js distinct', () => {
    expect(JobProfileSchema.safeParse(profile).success).toBe(true);
    for (const s of ['java', 'javascript', 'c', 'c++', 'c#', 'react', 'react-native', 'node.js']) {
      expect(skills.has(s)).toBe(true);
    }
    // Each distinct skill is its own requirement with a unique canonical key.
    expect(profile.requirements.filter((r) => r.canonicalKey === 'skill:java')).toHaveLength(1);
    expect(profile.requirements.filter((r) => r.canonicalKey === 'skill:javascript')).toHaveLength(1);
  });
});

describe('JD parser — false-inference protection', () => {
  it('does not convert a preferred cue into required', async () => {
    const profile = await parseJob(await ingestPastedText('Engineer\n\nRequirements\n- Experience with React.\n\nPreferred\n- Docker is a plus.'));
    expect(importanceOf(profile, 'docker')).toBe('preferred');
  });

  it('does not treat "experience with Java" as a years requirement', async () => {
    const profile = await parseJob(await ingestPastedText('Engineer\n\nRequirements\n- Experience with Java.'));
    expect(req(profile, (r) => r.type === 'experience_years')).toHaveLength(0);
    expect(importanceOf(profile, 'java')).toBe('required');
  });

  it('does not infer a certification from a plain technology mention', async () => {
    const profile = await parseJob(await ingestPastedText('Engineer\n\nRequirements\n- Experience with AWS and Docker.'));
    expect(req(profile, (r) => r.type === 'certification')).toHaveLength(0);
  });

  it('does not invent an education requirement when none is stated', async () => {
    const profile = await parseJob(await ingestPastedText('Engineer\n\nRequirements\n- Strong coding skills in Python.'));
    expect(req(profile, (r) => r.type === 'education')).toHaveLength(0);
  });
});
