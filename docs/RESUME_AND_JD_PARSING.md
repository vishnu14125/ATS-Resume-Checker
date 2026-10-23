# Resume and Job Description Parsing

> How files and pasted text become structured data: validation, extraction per format, normalisation, the resume parser and the JD parser. It covers what each parser does reliably, where it struggles, and the verified explanation of why the same resume can score differently as a PDF and as a DOCX.
>
> Code: `server/src/documents/` (ingestion) and `server/src/engine/resume/`, `server/src/engine/job/`, `server/src/engine/text/` (parsing). Experiments cited here were run on 2026-10-19 and 2026-10-20 against the real code, using fictional documents generated in a scratch directory outside the repository.

---

## 1. Accepted inputs and limits

| Input | How it arrives | Limits | Where enforced |
|---|---|---|---|
| PDF | multipart file `resume` or `job` | 10 MB; 15 pages; must contain selectable text; not password-protected | `upload.js` (multer), `fileValidation.js`, `extractors/pdf.js` |
| DOCX | multipart file | 10 MB file; at most 10 MB of *declared* unpacked XML | `fileValidation.js` (`declaredXmlBytes()`) |
| TXT (`.txt`, `.text`, or no extension) | multipart file | 1 MB | `fileValidation.js` |
| Pasted resume | `resumeText` (JSON or multipart field) | 100,000 characters (multipart text fields are also capped at 1 MB) | `runAnalysis.js`, `upload.js` |
| Pasted JD | `jobText` | 30,000 characters | `runAnalysis.js` (`JOB_TEXT_MAX_CHARS`) |
| Anything else (`.doc`, `.rtf`, images, ZIP files) | n/a | rejected with `415` | `fileValidation.js` |

**Over-limit input is rejected (413), never truncated.** The legacy app truncated text at 10,000 characters and collapsed all whitespace, which broke parsing; a regression test now checks that a skill stated after the first 10,000 characters is still found.

---

## 2. Upload handling and validation by content

1. **multer** reads up to one file per field into memory (`memoryStorage`). No temporary file is ever written, so there is nothing to clean up on any path (tested: "writes no temporary files on success or on any failure path").
2. **`validateUpload(buffer, { filename })`** decides the type from the **bytes**:

| Bytes look like… | Decision |
|---|---|
| Starts with `%PDF-` | PDF, whatever the file is called |
| ZIP signature `PK\x03\x04` and the first 4 KB contain `word/` or `[Content_Types].xml` | DOCX, after checking the declared unpacked XML size (≤ 10 MB) by reading the ZIP central directory **without decompressing** |
| ZIP but not a Word document | rejected |
| Named `.pdf` or `.docx` but the content does not match | `415` "This file is named like a PDF but its content is not a valid PDF." |
| No NUL byte in the first 4 KB | text, if the extension is `.txt`, `.text` or absent; a 1 MB cap applies |
| Text-like but with an unsupported extension (for example `.rtf`, `.md`) | `415` "Unsupported file type…" |
| Binary data | `415` |
| Empty, or fewer than 8 bytes | `422` |

**Why by bytes?** The filename and the `Content-Type` header are chosen by the client and can lie. A PNG renamed `cv.pdf` is rejected with `415` (verified over HTTP).

**Limitation of the zip-bomb guard:** it trusts the sizes the archive *declares*. A crafted archive that understates its sizes would pass this check; the 10 MB upload limit and the 100,000-character limit after extraction still bound the work. Not tested with such a crafted file.

---

## 3. Extractors

All extractors return the same *raw extraction* shape, `{ kind, extractor, extractorVersion, pageCount, lines[], links[], layout, warnings[] }`, which `normalizeDocument()` then turns into the `NormalizedDocument` contract.

### 3.1 PDF (`extractors/pdf.js`, pdf.js 3.11.174 legacy build)

- `getDocument({ data, useSystemFonts: true, isEvalSupported: false, disableFontFace: true, verbosity: 0 })`. **`isEvalSupported: false`** disables pdf.js's use of `eval` for fonts, the published mitigation for the arbitrary-JavaScript advisory against pdf.js up to 4.7.76.
- More than **15 pages** → `422` (`too_many_pages`). A password → `422` (`encrypted`). Unreadable → `422` (`corrupt`).
- **Line reconstruction (`reconstructLines()`)**: pdf.js gives text *items* with x/y positions, not lines. Items whose baselines are within `max(2, 0.5 × median font height)` are grouped into one row, sorted top to bottom and then left to right. A space is inserted between items when the horizontal gap exceeds a quarter of the font height. Each row records `page` and the median `fontSize`. `bold` is always `null`, and **`isBullet` is always `false`**: a bullet is recognised later only if a bullet character is part of the extracted text.
- **Links** come from link annotations on each page.
- **Multi-column suspicion (`detectMultiColumn()`)**: on a page with at least 8 lines, if at least 25% of lines start right of 45% of the page width *and* at least 25% start left of 35%, the layout is flagged. This feeds the `reading_order` check and the confidence reason; text order itself is **not** corrected.
- No selectable text at all → `422` "No selectable text was found. This looks like a scanned or image-only PDF…" (`no_text_layer`). There is **no OCR**.

### 3.2 DOCX (`extractors/docx.js`, mammoth 1.13.0)

- `mammoth.convertToHtml({ buffer })` → HTML → `htmlToLines()`:
  - `<p>` → a line; a paragraph that is entirely bold or strong → `bold: true` (a likely heading)
  - `<h1>`–`<h6>` → a line with `bold: true`
  - `<li>` → a line with `isBullet: true`, glyph `•`, `indentLevel: 1`
  - `<tr>` → one line with the cell texts joined by `" | "`; `<table>` elements are counted (`layout.tableCount`)
  - `<a href>` → links with anchor text
  - HTML entities are decoded; all other tags are stripped
- `pageCount: null` (Word has no fixed pages); `multiColumnSuspected: false`.
- Up to 20 mammoth conversion warnings are kept as document warnings.
- Corrupt → `422` (`corrupt`); no text → `422` (`no_text_layer`).

**Verified DOCX defects (2026-10-20):**

| Situation | What happens | How it was verified |
|---|---|---|
| A paragraph containing **soft line breaks** (Shift+Enter, `<w:br/>`), which is common in resume header blocks | All parts are glued together without a space: `Meera Testwell` + `meera.testwell@example.com` + `+91 90000 11111` became one line. The **name was not found** and the **email was extracted wrongly** (`testwellmeera.testwell@example.com`). | A generated DOCX run through `ingestFile()` and `parseResume()` |
| **Nested** bullet lists | The child item is merged into its parent bullet without a space ("Built APIsNested item") | `htmlToLines()` called with mammoth-style HTML |
| Text only in Word page headers or footers | Headers and footers are not among mammoth's supported features, so such content is likely missed | Mammoth documentation; **not tested** |
| Text boxes | Mammoth emits them as separate paragraphs after the paragraph that contains them, so order may change | Mammoth documentation; not tested |

### 3.3 TXT (`extractors/text.js`)

- Decoded as UTF-16 when a byte-order mark is present (`FF FE` or `FE FF`), otherwise as UTF-8 (a UTF-8 BOM is stripped). Invalid UTF-8 bytes become replacement characters (`�`), which the `encoding` health check counts.
- `\r\n` and `\r` are normalised to `\n`; every line is kept, including blank ones (which become `blankLineBefore` flags).
- Whitespace-only content → `422` "The text file is empty."

### 3.4 Pasted text

`extractPastedText()` uses exactly the same line splitting as TXT, with `kind: "paste"`. Uploaded TXT and pasted text converge on the same result (tested: "gives the same analysis for a document whether uploaded or pasted").

---

## 4. Normalisation (`documents/normalize.js`)

Per line (`normalizeLineText()`):

| Step | Example |
|---|---|
| Unicode **NFKC** (compatibility normalisation) | the ligature `ﬁ` becomes `fi`; full-width `ＡＢＣ` becomes `ABC` |
| Remove invisible characters (zero-width spaces and joiners, BOM, soft hyphen) | `Re​act` becomes `React` |
| Exotic spaces (no-break, thin, ideographic) → normal space | |
| Lift a **leading bullet glyph** followed by whitespace into `isBullet`/`bulletGlyph`, and estimate `indentLevel` from the leading spaces | `- Built…` becomes `Built…` with `isBullet: true`, glyph `-` |
| Collapse runs of spaces and tabs; trim | |

Recognised bullet glyphs: `• ▪ ● ◦ ‣ ⁃ ∙ · ■ ▸ ► – — * -`, each **followed by whitespace** ("-5%" is not a bullet).

Document level:

- Blank lines are dropped, and the *next* kept line gets `blankLineBefore: true`. Only TXT and pasted input contain blank lines; the PDF and DOCX extractors never emit empty lines.
- Each kept line has `index`, `text` (normalised, used for parsing), **`original`** (exactly as extracted, used for evidence quotes), `page`, bullet fields and `style { fontSize, bold, allCaps }`.
- `stats`: `charCount`, `wordCount`, `lineCount`, `nonAsciiRatio`, `replacementCharCount`, `privateUseCharCount` (icon-font glyphs).
- `links`: annotation and HTML links mapped to the line containing their URL or anchor text, plus bare `http(s)://` URLs found in the text.
- **`textHash`**: SHA-256 of the normalised text joined with `\n`. It identifies a document without storing it.
- Validated against the `NormalizedDocument` contract (line indexes must be sequential, and `lineCount` must equal `lines.length`).

What normalisation deliberately does **not** do: lower-case text, remove punctuation (`@ + # / % $ & |` are preserved), stem words, fix spelling, or reorder lines.

---

## 5. Resume parser (`engine/resume/parseResume.js`)

### 5.1 Section detection (`sections.js`)

A line is a heading when it is at most 60 characters long, has at most 6 words, and (after lower-casing, removing a trailing `:` or `.`, and replacing `&` with `and`) matches one of these patterns from `engine/text/lexicons.js`:

| Section type | Example headings |
|---|---|
| summary | Summary, Profile, Objective, About me, Professional summary, Career objective |
| experience | Experience, Work experience, Professional experience, Employment history, Work history |
| projects | Projects, Personal/Academic/Selected/Key/Side projects |
| education | Education, Academic background, Academics, Qualifications |
| skills | Skills, Technical skills, Expertise, Core competencies, Technologies, Tech stack |
| certifications | Certifications, Certificates, Licenses (and certifications), Credentials |
| achievements, publications, volunteering, languages, interests | Awards, Honors; Publications, Research; Volunteering, Leadership, Activities; Languages; Interests, Hobbies |

- `"Skills: React, Node"` is treated as a heading plus *inline content*.
- Everything before the first heading is the `header` section.
- Heading confidence starts at 0.7 and rises with ALL CAPS (+0.12), bold (+0.1) and a preceding blank line (+0.06). It is recorded, but **detection does not depend on it**.
- **Struggles with:** unusual headings ("Where I've worked", "Freelance projects" are not recognised), headings embedded in sentences, and two-column layouts where headings are interleaved with other text.

### 5.2 Contact (`contact.js`)

Searched in the header section (or the first 25 lines if there is no header):

| Field | Rule |
|---|---|
| Email | Regular expression; lower-cased; de-duplicated |
| Phone | Loose pattern, then 7 to 15 digits; year ranges such as "2019 – 2021" are rejected |
| Name | The first line of 2 to 4 capitalised words with no `@` or digits, and not just "Resume" or "CV". Confidence 0.7. |
| Location | First "City, ST" or "City, Country" pattern without `@`. Confidence 0.5. |
| Links | LinkedIn (`linkedin.com/in/…`), GitHub, other `http(s)` URLs as portfolio |

**Struggles with:** names in lower case or with a single word, contact details placed at the end, icon glyphs instead of labels, and DOCX soft line breaks (section 3.2).

### 5.3 Experience, projects and education entries (`entries.js`)

**Grouping (`groupEntries()`):** within a section, a **non-bullet** line starts a **new entry** when there is no current entry, when the current entry has already seen bullets, when there is a blank line before it, or when it has a date and the current entry already has one. The first up to 5 non-bullet lines are header lines; later non-bullet lines become description lines; bullet lines are attached to the current entry.

> This rule assumes "header lines, then bullets". It is the root cause of the PDF behaviour in section 9: a wrapped bullet continuation is a non-bullet line *after* bullets, so it starts a phantom entry.

**Experience:**

- **Dates:** the first date range found in the header lines (`findDateRange()`).
- **Title and organisation:** the header (with the date removed) is split on ` at `, `@`, `|`, `–`, `—`, ` - ` and `,`. The part containing a role cue (engineer, developer, intern, analyst, manager…) is the title; a part with an organisation cue (Inc, Ltd, Pvt, Technologies, Labs, Solutions…) is the organisation; otherwise the order decides.
- **Employment type:** `internship` (intern, internship, co-op), `contract`, `freelance`, `part_time`, else `full_time`.
- **Bullets:** the first word is checked against an action-verb list (develop, design, build, built, led, reduced and others, about 50 lemmas); metrics are detected as percent (`35%`), currency (`$20,000`, `₹5L`), multiplier (`3x`), duration (`200 ms`, `6 months`) or count (`12,000`, `40`).

**Projects:** the name is the header text before `|`, `(`, `–` or `—`; the tech stack is the text after it or a `Tech:`/`Stack:`/`Built with:` line (unambiguous skills only). Context: hackathon, academic, open source, personal or unknown. Links are taken from `http(s)` URLs.

**Education:** each line is split on spaced separators (` - `, ` – `, ` | `). The **degree level** comes from patterns (doctorate; master: MS, M.Tech, MBA; bachelor: B.Tech, B.E., BSc, Bachelor of…; associate; diploma; high school). Ambiguous abbreviations (MS, BA, BE, BSc, MSc) are accepted inside the education section. The **institution** is the segment containing a cue (university, college, institute, school, IIT, NIT…). The **field** is matched against a small list (computer science, CSE, IT, electrical, data science, mathematics, information systems, electronics, mechanical, business). Also extracted: dates, GPA (`8.5/10`, `GPA: 3.7/4.0`) and status (`in_progress` for "expected" or "pursuing").

**Certifications:** each non-trivial line in the certifications section; 13 known patterns map to ids and issuers (AWS Cloud Practitioner, other AWS Certified, AZ-900, AZ-104, CKA, CKAD, PMP, Scrum, CISSP, CCNA, Security+, Google Cloud, Oracle Java). Status is `in_progress` (pursuing or expected), `active` (a known certification) or `unknown`.

**Languages, achievements:** read from their sections; for example `Hindi (native)` gives the name and proficiency.

### 5.4 Skills

- **Mentions:** every line is scanned with `taxonomy.recognize()` (see [SCORING_AND_MATCHING.md §4](SCORING_AND_MATCHING.md#4-taxonomy-and-exact-matching)). Each mention records its position, section, entry and bullet. Ambiguous names need the skills section or an unambiguous skill on the same line.
- **Skills section items:** the section's lines (after removing a `Category:` label) are split on `, ; | • ·`, ` / ` or double spaces; each item is resolved to a skill id or kept as raw text (`skillId: null`).
- Entries and bullets are back-filled with the skill ids mentioned inside them.

### 5.5 Dates and durations (`engine/text/dates.js`)

| Supported form | Example |
|---|---|
| Month and year | `Jan 2020`, `January 2020`, `Jan. 2020`, `Mar '19` (two-digit years: 00–49 → 2000s, 50–99 → 1900s) |
| Numeric | `03/2019`, `2019-03`, `3.2019` |
| Season | `Summer 2022` (start month only) |
| Year only | `2019` |
| Range separators | `-`, `–`, `—`, `−`, `to`, `until`, `till`, `through`, `thru` |
| Current | `Present`, `Current`, `Now`, `Ongoing`, `Date`, resolved to the **reference date** |

- `computeDuration()` gives `{ minMonths, bestMonths, maxMonths }`; year-only ends widen the range (for example "2020 – 2021": min 2, best 13, max 24).
- **Totals** (`computeTotals()`) and the experience evaluator merge overlapping intervals (concurrent roles are not double-counted), and internships are kept separate. Closed year-only ranges are counted from January to December (the widest reading); see [SCORING_AND_MATCHING.md §8](SCORING_AND_MATCHING.md#8-documentation-versus-implementation-discrepancies).
- A single date with no range establishes no duration.
- "Present" uses `referenceDate.getFullYear()` and `getMonth()` in the **server's local time zone**, while the reference date is midnight UTC. On a server running behind UTC, on the first day of a month "Present" could resolve to the previous month. This was observed in the code and not tested; it does not occur in India (UTC+5:30) or on UTC servers.

### 5.6 Diagnostics

`unassignedLineCount` plus warnings: `NO_EMAIL`, `NO_EXPERIENCE`, `UNDATED_EXPERIENCE`, `NO_EDUCATION_SECTION`, `NO_SKILLS`. The resume-level warnings are copied into `result.diagnostics.warnings`.

---

## 6. Job description parser (`engine/job/parseJob.js`)

### 6.1 Sections

| Type | Example headings (`jdLexicons.js`) |
|---|---|
| responsibilities | Responsibilities, Duties, What you'll do, The role, About the role, Day to day |
| requirements | Requirements, Required qualifications, Minimum or Basic qualifications, Must haves, What you'll bring, Who you are, What we're looking for, Qualifications, **and also** Skills, Technical skills, Tech stack |
| preferred | Preferred, Preferred qualifications, Nice to have, Bonus, Pluses, Good to have, Desired |
| summary, about_company, benefits, location, eeo, experience, education | Overview, About us, Benefits/Perks/What we offer, Location, Equal opportunity…, Experience, Education |

Lines before the first heading form the **title** section. Its first line is taken as the job title and is **not** itself a statement.

### 6.2 Statements (`statements.js`)

Each bullet is one statement; a short comma list (two or more commas, under 160 characters, no final full stop) is split into items; prose is split into sentences (abbreviations such as "e.g." and "U.S.", decimals and "Node.js" are protected). Statement ids are deterministic (`stm_` plus a hash of the line index and text).

### 6.3 Importance classification

In this order (`classifyImportance()`):

1. A negation ("not required", "optional", "not necessary") → **preferred**
2. A required cue ("must have", "must", "required", "requires", "mandatory", "minimum", "at least", "essential") → **required**
3. A preferred cue ("preferred", "nice to have", "bonus", "a plus", "plus", "ideally", "desirable", "familiarity with", "exposure to") → **preferred**
4. Under a requirements section whose heading contains required, requirements, minimum, basic or must → **required**; under any other requirements-type heading (for example "Qualifications" or "Skills") → **contextual**
5. A preferred section → **preferred**; responsibilities or anything else → **contextual**

Verified: a JD whose heading is just **"Qualifications"** made "3 years of experience with Python" and "Experience with Django" **contextual** (weight 0.15), not required.

### 6.4 Requirement extractors (`requirements.js`)

Every statement, **in every section**, goes through all of these (responsibility extraction only applies in the responsibilities section):

| Extractor | Creates | Pattern summary | Hard constraint |
|---|---|---|---|
| Skills | `skill` (one per recognised taxonomy skill) | `taxonomy.recognize()`; ambiguous names only in requirements or preferred sections | required importance with a required cue or a hard heading (the flag is not used for knockouts) |
| Experience | `experience_years` | `3-5 years`, `at least 3 years`, `3+ years`, `three years`, `entry level`, or `N years` with the word "experience"; scope from "… experience in/with X" | importance is `required` |
| Education | `education` | doctorate, master (MS, MSc, M.Tech, MBA, "graduate degree"), bachelor (Bachelor's, BS, BSc, B.Tech, B.E., "degree in"), associate; field from "degree in X"; "related field" or "or equivalent" flags | importance is `required` |
| Certification | `certification` | the 13 known certification patterns, or "X certified", "X certification", "certified X" | importance is `required` |
| Language | `language` | fluent, proficient, native or conversational + a known spoken language (English, Hindi, Tamil, Telugu, German…). "Proficient in React" is **not** a language. | importance is `required` |
| Work authorisation | `work_authorization` | "authorized to work", "work authorization", "right to work", "visa sponsorship", "no sponsorship", "US citizen", "eligible to work" | **always** |
| Clearance | `clearance` | "security clearance", "secret clearance", "top secret", "TS/SCI", "active clearance" | **always** |
| Responsibility | `responsibility` | any statement in a responsibilities section | never |

**De-duplication:** requirements are keyed by `canonicalKey` (`skill:react`, `years:general`, `years:skill:python`, `education:bachelor`, `certification:aws-certified`, `work_authorization`…). On a repeat, the higher importance wins, hard flags are combined with OR, and source statements are merged. Requirement ids are `req_` plus a hash of the canonical key, so **the same requirement has the same id in every JD** (for example Java is always `req_e41c634d56b7`).

### 6.5 Identity fields (`identity.js`)

- **Title:** a `Title:`, `Position:` or `Role:` label in the title section, or else the first short line (confidence 0.8 if it contains a role word, otherwise 0.5).
- **Company:** only when explicit, from a `Company:` label or "<title> at <Company>" on the title line. Never guessed.
- **Location and work mode:** remote, hybrid or onsite cues; "Location: X", "based in X" or "located in X".
- **Employment type:** internship, part-time, contract or full-time keywords anywhere.
- **Seniority:** from the title (intern, junior, senior, staff, principal, lead, manager, director), or else from a general years requirement (≥ 8 staff, ≥ 5 senior, ≥ 2 mid, otherwise entry).
- **Soft skills:** communication, teamwork, leadership, problem solving and others. Recorded for information; **never scored**.

### 6.6 Diagnostics

`NO_REQUIREMENTS`, `NO_SKILLS`, `NO_TITLE`, `NO_CONTENT`, plus `unclassifiedStatementIds` (statements in requirements or preferred sections that produced no requirement).

---

## 7. Verified JD parsing edge cases (2026-10-20)

| JD text | What the parser produced | Assessment |
|---|---|---|
| A single line with no line breaks ("We need someone who knows Kubernetes and Docker and has 5+ years of experience.") | **No requirements** (the only line is the title) → Job Match `null` | Limitation: the JD needs line breaks or headings |
| Two lines, no headings | The second line is parsed: Python (contextual), 3+ years (required) | Works, with mostly contextual importance |
| "Qualifications" heading | All items contextual | Weights may be lower than the employer intends |
| "About us: … products with React and Go" | React becomes a **contextual requirement**; Go is dropped (ambiguous outside requirements) | Company-description text can create requirements |
| "Founded 12 years ago, we value experience" (About us) | A contextual **"12+ years of experience" requirement** | False positive |
| "You will be working closely with designers." | A **required "Bachelor degree" requirement**, because the pattern matches the word "be" as "B.E." | **False positive; a significant defect.** In a run with a React-only JD, Job Match dropped from what would have been 100 to 55, and a high-priority "add your degree" recommendation appeared. |
| "Strong knowledge of MS Office." | A master's degree requirement ("MS") | False positive |
| "As an Associate Engineer you will…" | An "Associate degree" requirement | False positive |
| "We offer visa sponsorship" (Benefits) | A hard `work_authorization` requirement | False positive with knockout potential ([SCORING_AND_MATCHING.md §6.5](SCORING_AND_MATCHING.md#65-known-defect-verified)) |
| "AWS Certified Solutions Architect certification is required." | A skill requirement (AWS) **and** a certification whose display name is the whole phrase | Works; the display name is clumsy |
| "Bachelor's degree in Computer Science or equivalent experience is required." | Education display name cut mid-word ("…or equivalent experience is requi") | Cosmetic: the field capture is limited to 50 characters |
| "Fluent in German." / "Proficient in React." | A language requirement (German) / a React skill (not a language) | Correct |

---

## 8. Reliability by parser

| Parser | Reliable for | Struggles with | Empty or incomplete result | Tests | Unverified |
|---|---|---|---|---|---|
| PDF extractor | Text-based, single-column PDFs; links; page counts | Wrapped lines split into separate lines; bullets drawn as graphics; multi-column order (detected, not fixed); headers and footers mixed into the text; no bold information | No text → `422 no_text_layer`; other failures → `422` | `documents.test.js`, `ingestionRealPath.test.js`, `jobIngestionRealPath.test.js` (real PDFs) | Word- or LaTeX-exported PDFs, true multi-column PDFs, scanned PDFs (only rejection is tested) |
| DOCX extractor | Paragraphs, Word lists (as bullets), headings, tables (as `a \| b` rows), hyperlinks | Soft line breaks (verified defect), nested lists (verified defect), headers and footers, text boxes | No text → `422`; corrupt → `422` | `documents.test.js` (HTML → lines, real DOCX), real-path tests | Real-world template DOCX files |
| TXT and paste | Everything is a line; blank lines preserved; best structure fidelity | Bullets without a glyph look like plain lines | Empty → `422` (TXT) or `400` (blank paste) | `resumeParser.test.js`, `analysisApi.test.js` (CRLF and JSON vs multipart) | Non-UTF encodings without a BOM (for example Windows-1252) would produce `�` characters |
| Resume parser | Conventional single-column resumes with standard headings, "Title \| Company \| Dates" lines and bulleted achievements | Creative headings, entries without dates, education written as one comma line (institution and degree become the whole line), non-software skills | Missing fields are `null` or empty plus diagnostics, never invented | `resumeParser.test.js` (17), `ingestionRealPath.test.js` | Large real-world resume corpora |
| JD parser | Bulleted JDs with clear Requirements and Preferred sections | Prose-only JDs; one-line JDs; false positives listed in section 7; only 80 taxonomy skills | `NO_REQUIREMENTS` → Job Match `null` | `jobParser.test.js` (18), `jobIngestionRealPath.test.js` | Large real-world JD corpora |

---

## 9. Investigation: why the same resume scores differently as PDF and DOCX

### 9.1 The observation

`FINAL_FRONTEND_VALIDATION_REPORT.md` (2026-10-05) reported, for one synthetic resume: pasted text 98.1, DOCX 98.1, PDF with text bullets 91.8, PDF with graphic bullets 88.9, and **Job Match 77.3 in all cases**.

### 9.2 Reproduction in this documentation pass

One fictional resume ("Kiran Placeholder") was produced as five inputs: pasted text, a TXT file, a DOCX with real Word bullet-list numbering and bold headings, a Chrome-printed PDF with bullet *characters* ("• …"), and a Chrome-printed PDF with HTML `<li>` bullets (Chrome draws these markers as graphics). One bullet was long enough to wrap onto a second line. Each input went through the real `ingestFile()` / `ingestPastedText()`, `parseResume()` and `assessResumeHealth()`, and then through the full runner against the same JD.

| Input | Lines | Lines marked as bullets | Experience entries | Resume Health | Job Match |
|---|---|---|---|---|---|
| Paste | 18 | 6 | 2 | **100** | 98.9 |
| TXT file | 18 | 6 | 2 | **100** | 98.9 |
| DOCX (Word list) | 18 | 6 | 2 | **100** | 98.9 |
| PDF, bullet characters | 19 | 6 | **3** (one phantom) | **93.3** | 98.9 |
| PDF, `<li>` markers | 20 | **0** | 2 | **94.8** | 98.9 |

The pattern matches the earlier report: Resume Health drops for PDFs, while Job Match is identical.

### 9.3 Root cause (traced to the code)

**Cause 1: a wrapped line becomes a separate line, and then a phantom entry.**
pdf.js has no notion of paragraphs. `reconstructLines()` in `extractors/pdf.js` emits one line per visual row, so the long bullet became:

```text
L4 • Built Node.js and Express services that process 12,000 orders per day for the logistics
L5   dashboard used by regional operations teams across five cities.
```

Line 5 has no bullet glyph, so `normalizeDocument()` marks it `isBullet: false`. In `groupEntries()` (`engine/resume/entries.js`), *a non-bullet line after bullets starts a new entry*, so "dashboard used by regional operations teams across five cities." became a third "experience entry" with no dates and no organisation, and the remaining two bullets moved to it. Resume Health then saw `dated_roles` at 2 of 3 (warn) and `entry_structure` at 2 of 3 (warn): structure fell from 1.0 to 0.667, costing **6.7 points** (100 → 93.3).

**Cause 2: bullets drawn as graphics are invisible.**
With `<li>` markers, the PDF text layer contains no bullet characters, so **no line is a bullet**. Every line in an entry becomes a header or description line. Then:

- `impact` has no bullets to grade → the component is **excluded** and its 15% weight re-normalised (no direct loss, but no credit for good bullets either)
- `STRUCT-ENTRY-CONTENT` counts entries with bullets or description lines. Only 1 of 3 entries had a description line (the first five lines of each entry count as header lines), costing **5.2 points** (100 → 94.8)
- wrapped lines are still split ("…tuning PostgreSQL" / "indexes.")

**Why Job Match is unaffected:** skill matching depends on *which skills are mentioned in which section*, not on bullet structure; all mentions stayed in the experience section, so evidence strength was unchanged. The phantom entry had no dates, so total experience months were unchanged too.

**Why DOCX matches pasted text:** mammoth reports Word list paragraphs as `<li>`, which become `isBullet: true`, and each paragraph is one line however it wraps on the page.

**Other format-dependent differences found in the code:**

| Check | PDF | DOCX | TXT and paste |
|---|---|---|---|
| `reading_order` | warns if multi-column is suspected | warns if the document has **any table** | always passes |
| `length` | warns above 3 pages or 1,400 words | words only (no page count) | words only |
| Heading confidence | no bold information | bold detected | uses blank lines |
| Evidence snippet | includes a "•" only if it was text | no glyph (list markers are not text) | includes the typed glyph |

### 9.4 Conclusion and status

- **Verified cause**: line-oriented PDF reconstruction (no paragraph or continuation merging, no visual bullet detection) combined with an entry-grouping rule that assumes "headers, then bullets".
- **Impact**: Resume Health only, typically a few points (6.7 and 5.2 in this experiment; 6.3 and 9.2 in the 2026-10-05 report). The direction and size depend on the resume.
- **Status**: **not fixed** (this was a documentation-only task). Possible directions for later: merge a non-bullet line into the previous bullet when it continues it (starts lower-case, same x-indent as the bullet text, no date); use pdf.js item positions to detect hanging indents; or treat a line indented further than its entry header as a continuation. Any fix should come with the PDF fixtures from this experiment as regression tests.

---

## 10. Typed errors from ingestion

All of these are `AppError`s (`server/src/shared/errors.js`) returned in the standard envelope, with `details.document` set to `"resume"` or `"job"`:

| Code | HTTP | `details.reason` | Message (abridged) |
|---|---|---|---|
| `UNSUPPORTED_MEDIA_TYPE` | 415 | none | "This file is named like a PDF but its content is not a valid PDF." / "Unsupported file type…" |
| `PAYLOAD_TOO_LARGE` | 413 | none | "The file exceeds the 10 MB limit." / "Text files are limited to 1 MB." / "This Word document is too large to process once unpacked." / "The resume is too long (limit: 100,000 characters)." |
| `UNPROCESSABLE_DOCUMENT` | 422 | `encrypted` | "This PDF is password protected…" |
| `UNPROCESSABLE_DOCUMENT` | 422 | `corrupt` | "This PDF could not be read…" / "This Word document could not be read…" |
| `UNPROCESSABLE_DOCUMENT` | 422 | `too_many_pages` | "This PDF has N pages; the limit is 15." |
| `UNPROCESSABLE_DOCUMENT` | 422 | `no_text_layer` | "No selectable text was found…" / "No readable text was found in this Word document." / "The text file is empty." |

A contract violation inside parsing (a bug, not bad input) surfaces as `500 INTERNAL_ERROR` with a generic message; the cause is logged with the request id.
