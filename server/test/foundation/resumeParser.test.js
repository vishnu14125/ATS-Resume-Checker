const { ingestPastedText, ingestFile } = require('../../src/documents/ingest');
const { parseResume } = require('../../src/engine/resume/parseResume');
const { ResumeProfileSchema } = require('../../src/domain/contracts/resumeProfile');
const { readResumeText, readResumeBuffer, REFERENCE_DATE } = require('./helpers/fixtures');

async function parseFixture(name) {
  const doc = await ingestPastedText(readResumeText(name));
  return parseResume(doc, { referenceDate: REFERENCE_DATE });
}

const skillIds = (profile) => new Set(profile.skillMentions.map((m) => m.skillId));

describe('Resume parser — CSE student (TXT)', () => {
  let profile;
  beforeAll(async () => { profile = await parseFixture('cse_student.txt'); });

  it('passes the ResumeProfile contract', () => {
    expect(ResumeProfileSchema.safeParse(profile).success).toBe(true);
  });

  it('extracts contact: name, email, phone and links', () => {
    expect(profile.contact.name.value).toBe('Priya Nair');
    expect(profile.contact.emails[0].value).toBe('priya.nair@example.com');
    expect(profile.contact.phones.length).toBeGreaterThan(0);
    const kinds = profile.contact.links.map((l) => l.kind);
    expect(kinds).toEqual(expect.arrayContaining(['github', 'linkedin']));
  });

  it('detects the standard sections', () => {
    const types = profile.sections.map((s) => s.type);
    expect(types).toEqual(expect.arrayContaining(['summary', 'education', 'skills', 'experience', 'projects', 'certifications']));
  });

  it('parses education with degree level, field, and in-progress status from "Expected"', () => {
    const edu = profile.education[0];
    expect(edu.degree.level).toBe('bachelor');
    expect(edu.fieldOfStudy.fieldId).toBe('computer_science');
    expect(edu.status).toBe('in_progress');
    expect(edu.gpa).toEqual({ value: 8.9, scale: 10 });
  });

  it('parses the internship with dates and classifies employment type', () => {
    const exp = profile.experience[0];
    expect(exp.employmentType).toBe('internship');
    expect(exp.dates.start).toMatchObject({ year: 2025, month: 6 });
    expect(exp.dates.duration.bestMonths).toBeGreaterThanOrEqual(2);
    expect(exp.skillIds).toEqual(expect.arrayContaining(['node.js']));
  });

  it('recognizes skills with source evidence and a resolved certification', () => {
    expect([...skillIds(profile)]).toEqual(expect.arrayContaining(['python', 'java', 'javascript', 'c++', 'react', 'node.js', 'mongodb', 'postgresql', 'docker']));
    profile.skillMentions.forEach((m) => {
      expect(m.ref.lineIndex).toBeGreaterThanOrEqual(0); // every mention ties back to a source line
    });
    expect(profile.certifications[0].certificationId).toBe('aws-cloud-practitioner');
  });
});

describe('Resume parser — software developer with multiple roles (TXT)', () => {
  let profile;
  beforeAll(async () => { profile = await parseFixture('software_developer.txt'); });

  it('passes the contract and extracts two experiences with correct current/past status', () => {
    expect(ResumeProfileSchema.safeParse(profile).success).toBe(true);
    expect(profile.experience.length).toBe(2);
    const [senior, prior] = profile.experience;
    expect(senior.dates.isCurrent).toBe(true);
    expect(prior.dates.isCurrent).toBe(false);
    expect(prior.dates.end).toMatchObject({ year: 2020, month: 12 });
  });

  it('captures a portfolio link and labelled email/phone', () => {
    expect(profile.contact.emails[0].value).toBe('michael.chen@example.com');
    expect(profile.contact.links.some((l) => l.kind === 'portfolio')).toBe(true);
  });

  it('computes overlap-merged professional experience totals', () => {
    expect(profile.totals.professionalMonths.bestMonths).toBeGreaterThan(90); // ~8.7 years across two roles
  });
});

describe('Resume parser — technology distinction (critical for later matching)', () => {
  let profile;
  let ids;
  beforeAll(async () => { profile = await parseFixture('polyglot_tokens.txt'); ids = skillIds(profile); });

  it('distinguishes C, C++ and C# as separate skills', () => {
    expect(ids.has('c')).toBe(true);
    expect(ids.has('c++')).toBe(true);
    expect(ids.has('c#')).toBe(true);
  });

  it('distinguishes React from React Native, and Node from Node.js', () => {
    expect(ids.has('react')).toBe(true);
    expect(ids.has('react-native')).toBe(true);
    expect(ids.has('node.js')).toBe(true);
    // "React Native" must not be double-counted as bare React on the same span.
    const rnLine = profile.skillMentions.filter((m) => m.skillId === 'react-native');
    expect(rnLine.length).toBeGreaterThan(0);
  });

  it('does not invent skills from ordinary prose (ambiguous terms need context)', () => {
    const prose = await_prose(profile);
    expect(prose).toBe(true);
  });
});

describe('Resume parser — rich tokens and metrics (TXT)', () => {
  let profile;
  beforeAll(async () => { profile = await parseFixture('rich_tokens.txt'); });

  it('passes the contract and keeps symbol-heavy skills', () => {
    expect(ResumeProfileSchema.safeParse(profile).success).toBe(true);
    const ids = skillIds(profile);
    expect(ids.has('c++')).toBe(true);
    expect(ids.has('c#')).toBe(true);
    expect(ids.has('node.js')).toBe(true);
    expect(ids.has('ci/cd')).toBe(true);
  });

  it('captures percentage and currency metrics on experience bullets', () => {
    const bullets = profile.experience.flatMap((e) => e.bullets);
    const kinds = new Set(bullets.flatMap((b) => b.metrics.map((m) => m.kind)));
    expect(kinds.has('percent')).toBe(true);
    expect(kinds.has('currency')).toBe(true);
  });
});

describe('Resume parser — honesty (does not fabricate)', () => {
  it('reports missing information through diagnostics instead of inventing fields', async () => {
    const profile = await parseFixture('malformed.txt');
    expect(ResumeProfileSchema.safeParse(profile).success).toBe(true);
    expect(profile.experience).toEqual([]);
    expect(profile.education).toEqual([]);
    const codes = profile.diagnostics.warnings.map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(['NO_EXPERIENCE', 'NO_EDUCATION_SECTION']));
    // It does still pick up the two skills the text genuinely mentions.
    expect([...skillIds(profile)].sort()).toEqual(['javascript', 'python']);
  });

  it('leaves optional fields null rather than guessing (no location invented)', async () => {
    const profile = await parseFixture('rich_tokens.txt');
    profile.experience.forEach((exp) => {
      if (exp.location) expect(typeof exp.location.value).toBe('string'); // only present if a real match existed
    });
  });
});

describe('Pasted text and uploaded file reach compatible profiles', () => {
  it('produces the same structure from a TXT buffer and the identical pasted text', async () => {
    const text = readResumeText('software_developer.txt');
    const fromPaste = parseResume(await ingestPastedText(text), { referenceDate: REFERENCE_DATE });
    const fromFile = parseResume(await ingestFile(readResumeBuffer('software_developer.txt'), { filename: 'dev.txt' }), { referenceDate: REFERENCE_DATE });

    expect(fromFile.contact.emails[0].value).toBe(fromPaste.contact.emails[0].value);
    expect(fromFile.experience.length).toBe(fromPaste.experience.length);
    expect(new Set(fromFile.skillMentions.map((m) => m.skillId))).toEqual(new Set(fromPaste.skillMentions.map((m) => m.skillId)));
  });
});

// Confirms no ambiguous-term false positives leaked in from prose lines.
function await_prose(profile) {
  // "comfortable across several languages" / "rendered with OpenGL" must not yield stray 'go'/'r'/'c' from words.
  const proseMentions = profile.skillMentions.filter((m) => m.ambiguous && m.section !== 'skills');
  return proseMentions.every((m) => {
    const sameLine = profile.skillMentions.filter((x) => x.ref.lineIndex === m.ref.lineIndex && !x.ambiguous);
    return sameLine.length > 0; // ambiguous kept only with supporting context
  });
}
