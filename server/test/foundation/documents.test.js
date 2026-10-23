const { validateUpload } = require('../../src/documents/fileValidation');
const { normalizeDocument } = require('../../src/documents/normalize');
const { htmlToLines } = require('../../src/documents/extractors/docx');
const { ingestFile, ingestPastedText } = require('../../src/documents/ingest');
const { NormalizedDocumentSchema } = require('../../src/domain/contracts/document');
const { readFixtureBuffer } = require('./helpers/fixtures');

const pdfHeader = (rest = 'fake pdf body content here') => Buffer.from(`%PDF-1.7\n${rest}`);

/** A minimal ZIP whose directory declares `declaredBytes` of uncompressed word/document.xml. */
function docxDeclaring(declaredBytes) {
  const name = Buffer.from('word/document.xml');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt32LE(declaredBytes, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(local.length + name.length, 16);
  return Buffer.concat([local, name, central, name, end]);
}

describe('File validation (content, not filename)', () => {
  it('accepts a real PDF by its %PDF- header even with a wrong extension', () => {
    expect(validateUpload(pdfHeader(), { filename: 'resume.txt' })).toMatchObject({ kind: 'pdf' });
  });

  it('accepts plain text and detects a DOCX by its zip + word/ content', () => {
    expect(validateUpload(Buffer.from('John Doe\nSoftware Engineer\n'), { filename: 'resume.txt' })).toMatchObject({ kind: 'txt' });
    const docxBuf = readFixtureBuffer('test_resume.docx');
    expect(validateUpload(docxBuf, { filename: 'resume.docx' })).toMatchObject({ kind: 'docx' });
  });

  it('rejects empty and too-small files (never silently accepted)', () => {
    expect(() => validateUpload(Buffer.alloc(0), { filename: 'x.txt' })).toThrow(/empty/i);
    expect(() => validateUpload(Buffer.from('abc'), { filename: 'x.txt' })).toThrow(/too small/i);
  });

  it('rejects oversized files with PAYLOAD_TOO_LARGE', () => {
    const big = Buffer.alloc(200);
    let error;
    try { validateUpload(big, { filename: 'x.txt', maxBytes: 100 }); } catch (e) { error = e; }
    expect(error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects a text file over 1 MB before decoding it', () => {
    let error;
    try { validateUpload(Buffer.alloc(1024 * 1024 + 1, 0x61), { filename: 'resume.txt' }); } catch (e) { error = e; }
    expect(error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(validateUpload(Buffer.alloc(1024 * 1024, 0x61), { filename: 'resume.txt' })).toMatchObject({ kind: 'txt' });
  });

  it('rejects a small DOCX that would unpack to an enormous document (zip bomb), before unzipping', async () => {
    let error;
    try { validateUpload(docxDeclaring(300 * 1024 * 1024), { filename: 'resume.docx' }); } catch (e) { error = e; }
    expect(error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(validateUpload(docxDeclaring(200 * 1024), { filename: 'resume.docx' })).toMatchObject({ kind: 'docx' });
    await expect(ingestFile(docxDeclaring(300 * 1024 * 1024), { filename: 'resume.docx' })).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('rejects a .pdf whose bytes are not a PDF, and binary files', () => {
    let err1;
    try { validateUpload(Buffer.from('this is not a pdf at all, just text'), { filename: 'resume.pdf' }); } catch (e) { err1 = e; }
    expect(err1.code).toBe('UNSUPPORTED_MEDIA_TYPE');

    const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05]); // PNG-ish, has NUL
    let err2;
    try { validateUpload(binary, { filename: 'image.png' }); } catch (e) { err2 = e; }
    expect(err2.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects unsupported text-like extensions', () => {
    let error;
    try { validateUpload(Buffer.from('#!/bin/bash\necho hi\n'), { filename: 'script.sh' }); } catch (e) { error = e; }
    expect(error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});

describe('Lossless normalization (regression against the old destructive cleaner)', () => {
  // The exact block the audit flagged; every meaningful token must survive.
  const CRITICAL = [
    'john@example.com',
    'C++',
    'C#',
    'JavaScript',
    'React / Node.js',
    '2024 – 2026',
    '95%',
    '$20,000',
    'https://github.com/example',
  ].join('\n');

  it('preserves @ + # / – % $ and URLs, and keeps line structure', async () => {
    const doc = await ingestPastedText(CRITICAL);
    const text = doc.lines.map((l) => l.text).join('\n');
    expect(text).toContain('john@example.com');
    expect(text).toContain('C++');
    expect(text).toContain('C#');
    expect(text).toContain('React / Node.js');
    expect(text).toMatch(/2024\s*–\s*2026/);
    expect(text).toContain('95%');
    expect(text).toContain('$20,000');
    expect(text).toContain('https://github.com/example');
    // Nine content lines in, nine content lines out — structure is not collapsed.
    expect(doc.lines).toHaveLength(9);
  });

  it('keeps the original text verbatim while normalizing the parse text', async () => {
    const doc = await ingestPastedText('•   Built   APIs\n​Zero​width  spaces\ttoo');
    const bullet = doc.lines.find((l) => l.isBullet);
    expect(bullet.original).toBe('•   Built   APIs'); // original untouched
    expect(bullet.text).toBe('Built APIs'); // normalized: glyph lifted, runs collapsed
    expect(bullet.bulletGlyph).toBe('•');
    const zeroWidth = doc.lines[1];
    expect(zeroWidth.text).toBe('Zerowidth spaces too'); // zero-width removed, tab/space collapsed
  });

  it('applies NFKC and strips a BOM without dropping meaningful characters', async () => {
    const doc = await ingestPastedText('﻿Ｒｅｓｕｍé\nﬁle');
    expect(doc.lines[0].text).toBe('Resumé');
    expect(doc.lines[1].text).toBe('file');
  });

  it('computes a stable content hash and honest stats', async () => {
    const a = await ingestPastedText('Line one\nLine two');
    const b = await ingestPastedText('Line one\nLine two');
    expect(a.textHash).toBe(b.textHash);
    expect(a.textHash).toMatch(/^[a-f0-9]{64}$/);
    expect(a.stats.lineCount).toBe(2);
  });

  it('rejects input that normalizes to nothing rather than producing an empty document', () => {
    expect(() => normalizeDocument({ kind: 'paste', extractor: 'paste', extractorVersion: '1', pageCount: null, lines: [{ text: '   ​  ' }], links: [], layout: {}, warnings: [] }))
      .toThrow(/no readable text/i);
  });
});

describe('DOCX HTML → lines (structure preserved, not one flat string)', () => {
  it('maps list items to bullets, headings to bold lines, tables to " | " rows, and captures links', () => {
    const html = '<h1>John Doe</h1><p><strong>SKILLS</strong></p><ul><li>React</li><li>Node.js</li></ul>'
      + '<table><tr><td>Company</td><td>Role</td></tr><tr><td>Acme</td><td>Engineer</td></tr></table>'
      + '<p>See <a href="https://github.com/jd">my GitHub</a>.</p>';
    const { lines, links, tableCount } = htmlToLines(html);
    const texts = lines.map((l) => l.text);
    expect(texts).toContain('John Doe');
    expect(lines.find((l) => l.text === 'React').isBullet).toBe(true);
    expect(lines.find((l) => l.text === 'SKILLS').bold).toBe(true);
    expect(texts).toContain('Company | Role');
    expect(texts).toContain('Acme | Engineer');
    expect(tableCount).toBe(1);
    expect(links).toEqual([{ url: 'https://github.com/jd', anchorText: 'my GitHub', page: null }]);
  });

  it('decodes HTML entities without corrupting C++/C# style content', () => {
    const { lines } = htmlToLines('<p>Skills: C++ &amp; C# &lt;advanced&gt;</p>');
    expect(lines[0].text).toBe('Skills: C++ & C# <advanced>');
  });
});

describe('Full ingestion produces a valid NormalizedDocument', () => {
  it('ingests a real PDF and passes the contract', async () => {
    const doc = await ingestFile(readFixtureBuffer('test_resume.pdf'), { filename: 'resume.pdf' });
    expect(NormalizedDocumentSchema.safeParse(doc).success).toBe(true);
    expect(doc.source.kind).toBe('pdf');
    expect(doc.source.pageCount).toBe(1);
    expect(doc.lines.some((l) => l.text.includes('@'))).toBe(true);
  }, 30000);

  it('ingests a real DOCX and passes the contract', async () => {
    const doc = await ingestFile(readFixtureBuffer('test_resume.docx'), { filename: 'resume.docx' });
    expect(NormalizedDocumentSchema.safeParse(doc).success).toBe(true);
    expect(doc.source.kind).toBe('docx');
  }, 30000);

  it('rejects a scanned/empty PDF with UNPROCESSABLE_DOCUMENT', async () => {
    // A structurally valid but text-less PDF is simulated via an image-only stream is hard to craft here;
    // instead assert the error contract on a corrupt PDF body.
    let error;
    try { await ingestFile(pdfHeader('%%EOF'), { filename: 'scan.pdf' }); } catch (e) { error = e; }
    expect(error.code).toBe('UNPROCESSABLE_DOCUMENT');
  }, 30000);
});
