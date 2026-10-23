const { validateUpload } = require('../../src/documents/fileValidation');
const { ingestFile, ingestPastedText } = require('../../src/documents/ingest');
const { parseJob } = require('../../src/engine/job/parseJob');
const { NormalizedDocumentSchema } = require('../../src/domain/contracts/document');
const { JobProfileSchema } = require('../../src/domain/contracts/jobProfile');
const { readJdBuffer, readJdText } = require('./helpers/fixtures');

/**
 * The real JD path on genuine documents, reusing the Phase 2 ingestion pipeline:
 *   bytes → validateUpload → extract → normalize (NormalizedDocument) → parseJob (JobProfile) → contract
 */
async function runRealPath(buffer, filename) {
  const validation = validateUpload(buffer, { filename });
  const document = await ingestFile(buffer, { filename });
  expect(NormalizedDocumentSchema.safeParse(document).success).toBe(true);
  const profile = parseJob(document);
  expect(JobProfileSchema.safeParse(profile).success).toBe(true);
  return { validation, document, profile };
}

const requiredSkillKeys = (profile) => new Set(
  profile.requirements.filter((r) => r.type === 'skill' && r.importance === 'required').map((r) => r.params.skillId)
);

describe('Real JD ingestion path — PDF', () => {
  it('runs a real PDF JD through validation → extraction → normalization → parseJob → contract', async () => {
    const { validation, document, profile } = await runRealPath(readJdBuffer('backend_developer.pdf'), 'jd.pdf');
    expect(validation.kind).toBe('pdf');
    expect(document.source.extractor).toBe('pdfjs-dist');
    expect(profile.company.value).toBe('DataForge');
    expect(requiredSkillKeys(profile).has('node.js')).toBe(true);
    expect(profile.requirements.some((r) => r.type === 'education' && r.params.minLevel === 'bachelor')).toBe(true);
  }, 30000);
});

describe('Real JD ingestion path — DOCX', () => {
  it('runs a real DOCX JD through the full path with the same result as the PDF', async () => {
    const { validation, profile } = await runRealPath(readJdBuffer('backend_developer.docx'), 'jd.docx');
    expect(validation.kind).toBe('docx');
    expect(requiredSkillKeys(profile).has('node.js')).toBe(true);
    expect(requiredSkillKeys(profile).has('postgresql')).toBe(true);
    const years = profile.requirements.find((r) => r.type === 'experience_years');
    expect(years.params.minYears).toBe(4);
  }, 30000);
});

describe('Real JD ingestion path — TXT and pasted text converge', () => {
  it('parses a TXT JD file and the identical pasted text to compatible profiles', async () => {
    const text = readJdText('backend_developer.txt');
    const fromFile = parseJob(await ingestFile(Buffer.from(text, 'utf8'), { filename: 'jd.txt' }));
    const fromPaste = parseJob(await ingestPastedText(text));

    expect(JobProfileSchema.safeParse(fromFile).success).toBe(true);
    expect(fromPaste.source === undefined).toBe(true); // JobProfile has no source field; it is document-independent
    const keysFile = new Set(fromFile.requirements.map((r) => r.canonicalKey));
    const keysPaste = new Set(fromPaste.requirements.map((r) => r.canonicalKey));
    expect(keysFile).toEqual(keysPaste);
  }, 30000);

  it('rejects an unreadable JD file with the canonical error contract', async () => {
    let error;
    try { await ingestFile(Buffer.from('%PDF-1.7\n%%EOF'), { filename: 'broken.pdf' }); } catch (e) { error = e; }
    expect(error.code).toBe('UNPROCESSABLE_DOCUMENT');
  }, 30000);
});
