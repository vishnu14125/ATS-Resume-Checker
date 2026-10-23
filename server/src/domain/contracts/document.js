const { z, schemaVersion, sha256Hex, versionString, WarningSchema } = require('./primitives');

/**
 * NormalizedDocument — the lossless, line-oriented text representation produced by
 * ingestion (Phase 2) and consumed by the resume and JD parsers. Parsers never
 * receive raw strings; they receive this.
 */

const DocLineSchema = z.strictObject({
  index: z.number().int().min(0),
  /** Normalized text used for parsing (NFKC, bullet glyph removed, whitespace collapsed within the line). */
  text: z.string(),
  /** The line exactly as extracted; used whenever text is shown to a user as evidence. */
  original: z.string(),
  page: z.number().int().min(1).nullable(),
  isBullet: z.boolean(),
  bulletGlyph: z.string().min(1).max(4).nullable(),
  indentLevel: z.number().int().min(0).nullable(),
  style: z.strictObject({
    fontSize: z.number().positive().nullable(),
    bold: z.boolean().nullable(),
    allCaps: z.boolean(),
  }),
  blankLineBefore: z.boolean(),
});

const NormalizedDocumentSchema = z
  .strictObject({
    schemaVersion,
    source: z.strictObject({
      kind: z.enum(['pdf', 'docx', 'txt', 'paste']),
      extractor: z.string().min(1),
      extractorVersion: versionString,
      pageCount: z.number().int().min(1).nullable(),
    }),
    lines: z.array(DocLineSchema),
    links: z.array(
      z.strictObject({
        url: z.string().min(1),
        anchorText: z.string().nullable(),
        lineIndex: z.number().int().min(0).nullable(),
      })
    ),
    layout: z.strictObject({
      multiColumnSuspected: z.boolean().nullable(),
      tableCount: z.number().int().min(0).nullable(),
      headerFooterLineIndexes: z.array(z.number().int().min(0)).nullable(),
    }),
    stats: z.strictObject({
      charCount: z.number().int().min(0),
      wordCount: z.number().int().min(0),
      lineCount: z.number().int().min(0),
      nonAsciiRatio: z.number().min(0).max(1),
      replacementCharCount: z.number().int().min(0),
      privateUseCharCount: z.number().int().min(0),
    }),
    warnings: z.array(WarningSchema),
    textHash: sha256Hex,
  })
  .check((ctx) => {
    const { lines, stats } = ctx.value;
    lines.forEach((line, i) => {
      if (line.index !== i) {
        ctx.issues.push({ code: 'custom', input: ctx.value, message: `line ${i} has index ${line.index}; lines must be indexed sequentially`, path: ['lines', i, 'index'] });
      }
    });
    if (stats.lineCount !== lines.length) {
      ctx.issues.push({ code: 'custom', input: ctx.value, message: 'stats.lineCount must equal lines.length', path: ['stats', 'lineCount'] });
    }
  });

module.exports = { DocLineSchema, NormalizedDocumentSchema };
