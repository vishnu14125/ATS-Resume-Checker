const { validateUpload } = require('../../src/documents/fileValidation');
const { ingestFile, ingestPastedText } = require('../../src/documents/ingest');
const { parseResume } = require('../../src/engine/resume/parseResume');
const { NormalizedDocumentSchema } = require('../../src/domain/contracts/document');
const { ResumeProfileSchema } = require('../../src/domain/contracts/resumeProfile');
const { readFixtureBuffer, readResumeBuffer, REFERENCE_DATE } = require('./helpers/fixtures');

/**
 * The real production path, end to end, on genuine binary documents:
 *   bytes → validateUpload → extract → normalize (NormalizedDocument) → parseResume (ResumeProfile) → contract
 *
 * The previous project had many green tests while this exact path was broken, so
 * these run through real files rather than idealized in-memory objects.
 */
async function runRealPath(buffer, filename) {
  const validation = validateUpload(buffer, { filename }); // stage 1: file validation
  const document = await ingestFile(buffer, { filename }); // stages 2–3: extract + normalize
  expect(NormalizedDocumentSchema.safeParse(document).success).toBe(true);
  const profile = parseResume(document, { referenceDate: REFERENCE_DATE }); // stage 4: parse
  expect(ResumeProfileSchema.safeParse(profile).success).toBe(true); // stage 5: contract
  return { validation, document, profile };
}

describe('Real ingestion path — PDF', () => {
  it('runs a real PDF resume through validation → extraction → normalization → parsing → contract', async () => {
    const { validation, document, profile } = await runRealPath(readFixtureBuffer('test_resume.pdf'), 'resume.pdf');
    expect(validation.kind).toBe('pdf');
    expect(document.source.extractor).toBe('pdfjs-dist');
    expect(profile.contact.emails[0].value).toBe('jane.smith@example.com');
    expect(profile.experience.length).toBeGreaterThan(0);
    expect(profile.education[0].degree.level).toBe('bachelor');
  }, 30000);

  it('preserves the audit\'s critical tokens through the REAL PDF path into the profile', async () => {
    const { document, profile } = await runRealPath(readResumeBuffer('critical_tokens.pdf'), 'critical.pdf');
    const text = document.lines.map((l) => l.text).join('\n');
    // Survives extraction + normalization (regression against the destructive cleaner).
    for (const token of ['jordan.blake@example.com', 'C++', 'C#', 'JavaScript', '95%', '$20,000']) {
      expect(text).toContain(token);
    }
    expect(text).toMatch(/2024\s*[–—-]\s*2026/);
    // And is understood by the parser.
    const ids = new Set(profile.skillMentions.map((m) => m.skillId));
    expect(ids.has('c++')).toBe(true);
    expect(ids.has('c#')).toBe(true);
    expect(ids.has('javascript')).toBe(true);
    expect(profile.contact.emails[0].value).toBe('jordan.blake@example.com');
    expect(profile.contact.links.some((l) => l.kind === 'github')).toBe(true);
  }, 30000);
});

describe('Real ingestion path — DOCX', () => {
  it('runs a real DOCX resume through the full path', async () => {
    const { validation, document, profile } = await runRealPath(readFixtureBuffer('test_resume.docx'), 'resume.docx');
    expect(validation.kind).toBe('docx');
    expect(document.source.extractor).toBe('mammoth-html');
    expect(profile.contact.emails[0].value).toBe('john.doe@example.com');
    expect(profile.sections.map((s) => s.type)).toEqual(expect.arrayContaining(['skills', 'experience', 'education']));
    expect(new Set(profile.skillMentions.map((m) => m.skillId))).toContain('react');
  }, 30000);
});

describe('Real ingestion path — pasted text converges with files', () => {
  it('parses pasted resume text through the same path to a valid profile', async () => {
    const document = await ingestPastedText('Ada Lovelace\nada@example.com\n\nSKILLS\nPython, C++\n\nEXPERIENCE\nEngineer, Analytical Co\n2023 - Present\n- Built compilers in C++.');
    expect(document.source.kind).toBe('paste');
    const profile = parseResume(document, { referenceDate: REFERENCE_DATE });
    expect(ResumeProfileSchema.safeParse(profile).success).toBe(true);
    expect(profile.contact.emails[0].value).toBe('ada@example.com');
    expect(new Set(profile.skillMentions.map((m) => m.skillId)).has('c++')).toBe(true);
  });
});
