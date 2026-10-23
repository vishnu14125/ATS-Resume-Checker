# The Analysis Pipeline: From Raw Input to Stored Result

> This document follows one analysis through every stage of the real code. All numbers in the worked example were produced by running the actual engine (`createAnalysisRunner` with a fixed reference date of **2026-10-19**) on a **fictional** resume and job description during this documentation pass. They are not hand-calculated or invented.
>
> Related: [ARCHITECTURE.md](ARCHITECTURE.md) (structure), [RESUME_AND_JD_PARSING.md](RESUME_AND_JD_PARSING.md) (parsers in depth), [SCORING_AND_MATCHING.md](SCORING_AND_MATCHING.md) (formulas).

---

## 1. The call graph

```text
Browser: AnalysisPage.handleAnalysis()  →  lib/api.js createAnalysis()  →  POST /api/v1/analyses
│
├─ app.js middleware: requestContext → helmet → compression → cors → express.json/urlencoded → global rate limiter
└─ api/v1/analyses.routes.js  POST "/"
   ├─ authenticate (api/middleware/authenticate.js → tokenService.verify)
   ├─ analysisRateLimiter (api/middleware/rateLimit.js)
   ├─ uploadDocuments (api/middleware/upload.js, multer memory storage: fields "resume", "job")
   ├─ validate({ body: CreateAnalysisBodySchema })  (api/middleware/validate.js)
   └─ handler: buildAnalysisInput(body, files) → analysisService.create({ userId, input })
      └─ application/analysis/analysisService.js create()
         ├─ runAnalysis(input)  (application/analysis/runAnalysis.js)
         │  ├─ ingest(resume): ingestFile() or ingestPastedText()  (documents/ingest.js)
         │  │    validateUpload() → extractPdf() | extractDocx() | extractText() | extractPastedText() → normalizeDocument()
         │  ├─ ingest(job)  (only when a job was supplied)
         │  ├─ parseResume(resumeDocument, { referenceDate })  (engine/resume/parseResume.js)
         │  ├─ assessResumeHealth({ normalizedDocument, resumeProfile })  (engine/scoring/resumeHealth.js)
         │  ├─ [job] parseJob(jobDocument)  (engine/job/parseJob.js)
         │  ├─ [job] matchRequirements(resumeProfile, jobProfile)  (engine/matching/matchRequirements.js)
         │  ├─ [job] evaluateEligibility({ ... })  (engine/evaluation/evaluate.js)
         │  ├─ [job] scoreJobMatch({ jobProfile, assessments, eligibility })  (engine/scoring/jobMatch.js)
         │  ├─ buildRecommendations({ resumeHealth, jobMatch, evidence })  (engine/recommendations/recommend.js)
         │  └─ parseContract(AnalysisResultSchema, ...)  → { result, record }
         ├─ analysisRepository.create({ userId, ...record, result })  (infrastructure/repositories/analysisRepository.js)
         └─ toAnalysisView(...) → sendSuccess(res, 201, { analysis })
Browser: navigate("/results/:id") → ResultsPage → getAnalysis(id) → tabs render result
```

---

## 2. Stage by stage

Each stage lists its **input → output**, how it works, the files, its failure cases and its tests.

### Stage 1: Request arrives and gets an identity

- **Input → output:** an HTTP request → `req.id` and an `X-Request-Id` response header.
- **How:** `requestContext()` reuses a client-supplied `X-Request-Id` if it matches `^[A-Za-z0-9._:-]{8,128}$`; otherwise it generates a UUID. When the response finishes, one `http.request` log line is written with method, path (query string removed), status, duration and user id.
- **Files:** `server/src/api/middleware/requestContext.js`
- **Tests:** `apiConventions.test.js` ("echoes a well-formed X-Request-Id and replaces a malformed one")

### Stage 2: Authentication and authorisation

- **Input → output:** `Authorization: Bearer <JWT>` → `req.auth = { userId, email }`.
- **How:** `authenticate` requires the Bearer scheme. `tokenService.verify()` accepts only HS256, maps an expired token to `TOKEN_EXPIRED`, and rejects a payload whose `id` is not a 24-character hex ObjectId. Authorisation (ownership) happens later, in the repositories, which always filter by `userId`.
- **Failures:** missing header → `401 UNAUTHENTICATED`; malformed or forged token → `401` "Invalid access token."; expired → `401 TOKEN_EXPIRED`.
- **Files:** `api/middleware/authenticate.js`, `application/auth/tokenService.js`
- **Tests:** `auth.test.js` (expired tokens, other secret, the `none` algorithm, missing user id, deleted account)

### Stage 3: Rate limiting

- `analysisRateLimiter` allows 30 analysis creations per 15 minutes per IP by default (`ANALYSIS_RATE_LIMIT_*`), on top of the global 500 per 15 minutes on `/api/`. Over the limit → `429 RATE_LIMITED`, and nothing is stored.
- **Tests:** `analysisApi.test.js` ("limits analysis creation separately, without affecting reads or storing the rejected analysis")

### Stage 4: Multipart or JSON handling

- **Input → output:** request body → `req.files` (buffers) and `req.body` (strings).
- **How:** `createDocumentUpload({ fields: ['resume', 'job'] })` uses multer **memory storage**: at most one file per field, 10 MB per file, 10 text fields of up to 1 MB each. Non-multipart (JSON) requests pass straight through and are parsed by `express.json()`. The client-supplied MIME type is **not trusted**; bytes are checked in Stage 8.
- **Failures:** file over 10 MB → `413` "The file exceeds the 10 MB limit."; unexpected file field or extra files → `400`; malformed multipart → `400`.
- **Files:** `api/middleware/upload.js`

### Stage 5: Request validation

- **Input → output:** raw body → `req.validated.body`, then `buildAnalysisInput()` → `{ resume: { file } | { text }, job: { file } | { text } | null }`.
- **How:** `CreateAnalysisBodySchema` is a *strict* object with optional `resumeText` and `jobText` strings. It deliberately does **no trimming or truncation**, so characters such as `+ # @ %` and line breaks reach ingestion exactly as sent. `buildAnalysisInput()` then enforces: a resume is required; each document is a file **or** text, never both; a blank text field means "not provided".
- **Failures:** `400 VALIDATION_ERROR` with `details.issues[] = { path, message, code }`, for example `body.resume: A resume is required…`.
- **Files:** `api/v1/schemas/analyses.schemas.js`, `api/middleware/validate.js`
- **Tests:** `analysisApi.test.js` ("requires a resume", "rejects a document sent both as a file and as text", "the request schema and input builder never alter text")

### Stage 6: Orchestration starts

- `analysisService.create()` calls `runAnalysis(input)`. The runner fixes the **reference date** as today's UTC calendar day (for example `2026-10-19`). Every date calculation ("Present", recency) uses it, which makes the result reproducible for that day. Each stage is timed into `diagnostics.timingsMs`.
- **Files:** `application/analysis/analysisService.js`, `application/analysis/runAnalysis.js`

### Stage 7: Text size pre-check (pasted text only)

- Pasted resume text longer than **100,000** characters, or JD text longer than **30,000**, is rejected with `413` *before* processing, and is never truncated. After extraction, the same limits are checked again against the normalised character count (so a 9 MB DOCX full of text is also caught).
- Blank text never gets this far through the API: `buildAnalysisInput()` treats a blank field as "not provided", so a blank resume gets `400` ("A resume is required…"). The runner's own `422` "No resume text was provided." only applies when it is called directly (for example from tests or scripts).

### Stage 8: File validation by content

- **Input → output:** buffer and filename → `{ kind: 'pdf' | 'docx' | 'txt' }`.
- **How:** `validateUpload()` checks size (8 bytes to 10 MB), then **sniffs the bytes**. `%PDF-` means PDF. A ZIP signature (`PK\x03\x04`) with `word/` or `[Content_Types].xml` in the first 4 KB means DOCX, and the ZIP directory's *declared* unpacked XML size must be at most 10 MB (a zip-bomb guard that runs without decompressing anything). Anything else must look like text (no NUL byte in the first 4 KB) and have an allowed or no extension, with a 1 MB cap for text files.
- **Failures:** a file named `.pdf` that is not a PDF → `415`; an unknown extension such as `.rtf` → `415`; binary data → `415`; empty or tiny → `422`; too big → `413`.
- **Files:** `documents/fileValidation.js`
- **Tests:** `documents.test.js` (8 validation tests, including the zip bomb), `analysisApi.test.js` ("rejects unsupported files by their content, not their name or MIME type")

### Stage 9: Text extraction

| Source | Extractor | What it returns |
|---|---|---|
| PDF | `extractPdf()`: pdf.js text items grouped into lines by baseline, sorted left to right; link annotations; a conservative two-column check | lines with `page` and `fontSize`; `pageCount`; `layout.multiColumnSuspected` |
| DOCX | `extractDocx()`: mammoth HTML → `<p>`, `<h1-6>`, `<li>`, `<tr>` → lines | lines with `isBullet` for list items, `bold` for headings; table count; links with anchor text |
| TXT | `extractText()`: UTF-8, or UTF-16 when a byte-order mark is present | one raw line per text line |
| Paste | `extractPastedText()` | same as TXT |

- **Failures:** encrypted PDF → `422` (reason `encrypted`); corrupt PDF or DOCX → `422` (`corrupt`); more than 15 PDF pages → `422` (`too_many_pages`); no selectable text (a scanned PDF) → `422` (`no_text_layer`).
- **Files:** `documents/extractors/pdf.js`, `docx.js`, `text.js`. Details: [RESUME_AND_JD_PARSING.md](RESUME_AND_JD_PARSING.md).

### Stage 10: Normalisation → `NormalizedDocument`

- **How:** per line: Unicode **NFKC** normalisation (for example "ﬁ" becomes "fi" and full-width characters become ASCII), invisible characters removed, exotic spaces mapped to a normal space, a leading bullet glyph (`• ▪ ● ◦ ‣ ⁃ ∙ · ■ ▸ ► – — * -`) lifted into `isBullet`/`bulletGlyph`, and whitespace runs collapsed. **Blank lines are dropped** but recorded as `blankLineBefore` on the next line. Each line keeps `original`, its exact extracted text. The document gets `stats` (characters, words, lines, non-ASCII ratio, replacement-character and private-use-character counts), the links mapped to lines, and `textHash`, a SHA-256 of the normalised text.
- **Why lossless:** the legacy cleaner deleted `@ + # / – • % $` and broke emails, `C++` and dates. Now evidence quotes come from `original`, and parsing uses the normalised `text`.
- **Failures:** nothing left after normalisation → `422`.
- **Files:** `documents/normalize.js`; contract `domain/contracts/document.js`
- **Tests:** `documents.test.js` ("preserves @ + # / – % $ and URLs, and keeps line structure", "keeps the original text verbatim…")

### Stage 11: Resume parsing → `ResumeProfile`

1. **Sections** (`engine/resume/sections.js`): a line of 60 characters or fewer that matches a heading lexicon (for example `experience`, `work history`, `technical skills`) starts a section. `"Skills: React, Node"` is a heading with inline content. Lines before the first heading form the `header` section.
2. **Contact** (`contact.js`): email, phone, name (2 to 4 capitalised words), "City, ST" location, and LinkedIn, GitHub or portfolio links, searched in the header section.
3. **Entries** (`entries.js`): within experience, projects and education sections, lines are grouped into entries. A non-bullet line starts a new entry when the previous entry already has bullets, after a blank line, or when a second dated line appears. The header text is split into title and organisation by separators (`|`, `–`, ` at `, `,`) and role or organisation cue words. Dates come from `findDateRange()`. Bullets record their action verb and detected metrics.
4. **Skills** (`parseResume.js` → `taxonomy.recognize()`): every line is scanned for taxonomy surfaces. Ambiguous short names (`c`, `go`, `r`, `spring`, `spark`) are kept only in the skills section or on a line that also has an unambiguous skill. Each mention records its section, entry and bullet.
5. **Totals:** professional and internship months, with overlapping roles merged rather than summed.
6. **Diagnostics:** warnings such as `NO_EMAIL`, `UNDATED_EXPERIENCE`, `NO_SKILLS`.

- **Tests:** `resumeParser.test.js` (17), `ingestionRealPath.test.js`

### Stage 12: Resume Health

- **Input → output:** `NormalizedDocument` and `ResumeProfile` → `ResumeHealthReport` (checks, findings, `ScoreBreakdown`, readability label, limitations). It is computed **before and independently of** any job description. Formula: [SCORING_AND_MATCHING.md](SCORING_AND_MATCHING.md#2-resume-health).
- **Tests:** `scoring.test.js` (Resume Health section)

### Stage 13: Optional JD parsing → `JobProfile`

1. **Sections** (`engine/job/sections.js`): JD headings such as `Responsibilities`, `Requirements`, `Required Qualifications`, `Preferred`, `Nice to have`, `Benefits`, `About us`. Lines before the first heading form the `title` section.
2. **Statements** (`statements.js`): each bullet is one statement; a comma list is split into items; prose is split into sentences (protecting "e.g.", "Node.js" and "3.5"). Every statement has a deterministic id `stm_…` and a line reference.
3. **Requirements** (`requirements.js`): each statement is classified for **importance** and scanned by several extractors (skill, experience years, education, certification, language, work authorisation, clearance, and responsibility for the responsibilities section only). Requirements are **de-duplicated by `canonicalKey`**; on a collision the higher importance wins, hard-constraint flags are combined, and source statement ids are merged.
4. **Identity** (`identity.js`): title, company (only when explicit), work mode and location, employment type, seniority, soft skills.

- **Tests:** `jobParser.test.js` (18), `jobIngestionRealPath.test.js`

### Stage 14: Taxonomy resolution (used inside Stages 11 and 13)

`engine/taxonomy/taxonomy.js` compiles `data.js` (80 skills) into surface lookups. `recognize(text)` finds the longest non-overlapping, boundary-safe matches. `resolve(token)` canonicalises single tokens (`"NodeJS"` becomes `node.js`). Relationships: `impliesFor()` for partial credit, and `areForbidden()` for pairs that must never match each other. Details: [SCORING_AND_MATCHING.md](SCORING_AND_MATCHING.md#4-taxonomy-and-exact-matching).

### Stage 15: Requirement matching (skills)

- `matchRequirements()` builds a resume skill index (each skill's best mention, preferring experience over projects over certifications over education over skills over summary) and assesses `skill` and `skill_group` requirements:
  1. **Direct match** (exact, normalised or alias): `met`, credit 1.0, strength from the section of the best mention.
  2. **Implied match** through a taxonomy edge (for example PostgreSQL → SQL with weight 0.9): `partially_met`, credit equal to the edge weight. Forbidden pairs are never bridged.
  3. Otherwise `missing`, with a helpful reason when a confusable sibling is present ("Not matched: JavaScript is not Java.").
- All other requirement types are returned as `not_evaluated` here and handled in Stage 16.
- **Tests:** `matching.test.js` (12)

### Stage 16: Evidence, eligibility and knockouts

- `evaluateEligibility()` creates an **evidence registry**. Every skill match is grounded into an `Evidence` object (verbatim line, kind, strength, factors such as `applied_in_role`, `quantified_outcome`, `recent`). Non-skill requirements are evaluated by dedicated evaluators: experience (from explicit dates only), education (from parsed degrees only), certification (explicit listing only), language (the languages section), and work authorisation and clearance (explicit statements only, with negatives checked before positives).
- Each **hard** non-skill requirement produces a `KnockoutFinding`. `deriveEligibilityStatus()` turns the findings into `clear`, `review` or `likely_filtered`. A final integrity check makes sure every evidence id that is referenced exists.
- **Tests:** `eligibility.test.js` (26)

### Stage 17: Job Match scoring

- `scoreJobMatch()` turns every scored requirement into one weighted item: weight = type weight × importance weight; credit from status and evidence strength. It returns a `ScoreBreakdown`, `keywordCoverage`, and a `gate` (eligibility status and hard-knockout flag) that is stored **beside** the score and never applied to it.
- **Tests:** `scoring.test.js` (Job Match sections)

### Stage 18: Recommendations

- `buildRecommendations()` creates resume-scope recommendations from Resume Health deductions (rules in `resumeRules.js`) and job-scope recommendations from requirement assessments and knockout findings (`jobRules.js`), sorts them by priority, then rule order, then points at stake, and finally checks grounding (`assertGrounded()` throws if any cited id does not exist).
- **Tests:** `recommendations.test.js` (29)

### Stage 19: Result assembly and contract validation

- `runAnalysis()` assembles `{ schemaVersion: '1', mode, engine (versions), referenceDate, resume: { resumeVersionId: null, resumeTextHash }, job, jobMatch, evidence, resumeHealth, recommendations, diagnostics: { timingsMs, warnings } }` and validates it with `AnalysisResultSchema`. The schema is a discriminated union on `mode`, plus `checkReferentialIntegrity()`: every requirement is assessed exactly once; every evidence, requirement and finding id referenced anywhere exists; `engine.jobParserVersion` is set only in job mode.
- A violation throws `ContractViolationError` → `500 INTERNAL_ERROR` (generic message), and **nothing is stored**.
- **Tests:** `contracts.test.js`, `analysisPipeline.test.js`, `analysisApi.test.js` ("turns an invalid analysis result into a generic 500 and stores nothing")

### Stage 20: Persistence

- The `record` holds the small, queryable metadata: `mode`; document descriptors `{ kind, fileName (display name only, no path), sizeBytes, textHash }`; the JD's title and company; `summary` (scores, readability, eligibility, hard-knockout flag, recommendation counts); and `versions` (schema and every engine stage). `analysisRepository.create()` inserts `{ userId, ...record, result }` into `analyses`.
- **Not stored:** the file, the full document text, parsed profiles, tokens.
- **Tests:** `analysisApi.test.js` ("stores the result and metadata only…", "writes no temporary files on success or on any failure path")

### Stage 21: Response serialisation

- `toAnalysisView()` returns `{ id, createdAt, mode, resume, job, summary, versions, result, ai: { status, provider, model, results } }`, never `userId`. It is wrapped as `{ success: true, data: { analysis } }` with status **201**.

### Stage 22: Rendering

- The browser navigates to `/results/:id`, which fetches `GET /api/v1/analyses/:id` and renders the tabs. The UI only formats; it never recomputes.

### Stage 23: Optional AI enrichment (a separate request)

- Later, and only on request, `POST /api/v1/analyses/:id/ai` reads the stored `result`, builds a minimal redacted context, calls the provider, validates and grounds the output, and stores it under `analysis.ai.<task>`. **It never runs during Stages 1 to 22.** See [AI_INTEGRATION.md](AI_INTEGRATION.md).

---

## 3. Worked example

### 3.1 The fictional inputs

**Resume** (pasted; all names, employers and contact details are fictional):

```text
Ananya Demo
Bengaluru, KA
ananya.demo@example.com | +91 98765 43210 | https://github.com/ananya-demo

SUMMARY
Full-stack developer who builds web applications with React and Node.js.

EXPERIENCE
Software Engineer | Nimbus Analytics Pvt Ltd | Jul 2023 - Present
- Built React dashboards used by 40 internal analysts.
- Designed REST APIs in Node.js and Express backed by PostgreSQL.
- Reduced report generation time by 35% by adding Redis caching.

Software Engineering Intern | Orbit Labs | Jan 2023 - Jun 2023
- Wrote unit tests with Jest for a JavaScript billing service.

PROJECTS
Campus Events Portal | React, Node.js, MongoDB
- Developed an events portal used by 600 students.

EDUCATION
B.Tech in Computer Science
Example Institute of Technology (2019–2023)

SKILLS
JavaScript, TypeScript, React, Node.js, Express, PostgreSQL, MongoDB, Redis, Docker, Git
```

**Job description** (pasted):

```text
Full Stack Developer at Brightpath Software

About us
Brightpath builds hiring tools for small teams.

Responsibilities
- Build and maintain customer-facing web features.
- Review code and mentor junior developers.

Requirements
- 4+ years of professional software development experience.
- Strong experience with React and Node.js is required.
- Must have experience with SQL databases.
- Java is required for our legacy services.
- Bachelor's degree in Computer Science or a related field.
- Must be authorized to work in India.

Preferred Qualifications
- Experience with AWS is a plus.
- Familiarity with Docker.
```

### 3.2 After normalisation (Stage 10)

20 lines, 122 words, 844 characters, `textHash` `41ed0ea5…471f`. A selection:

| Line | `text` | `isBullet` | `blankLineBefore` | Note |
|---|---|---|---|---|
| 0 | `Ananya Demo` | no | no | |
| 3 | `SUMMARY` | no | **yes** | All caps raises heading confidence |
| 6 | `Software Engineer \| Nimbus Analytics Pvt Ltd \| Jul 2023 - Present` | no | no | |
| 7 | `Built React dashboards used by 40 internal analysts.` | **yes** (glyph `-`) | no | `original` is still `- Built React…` |
| 10 | `Software Engineering Intern \| Orbit Labs \| Jan 2023 - Jun 2023` | no | **yes** | Starts a new entry |

### 3.3 Resume profile (Stage 11)

- **Sections:** `header[0–2]`, `summary[3–4]`, `experience[5–11]`, `projects[12–14]`, `education[15–17]`, `skills[18–19]`
- **Contact:** name "Ananya Demo", email, phone "+91 98765 43210", location "Bengaluru, KA", one GitHub link
- **Experience:**

| Entry | Title | Organisation | Type | Dates | Duration | Bullets (verb, metric) |
|---|---|---|---|---|---|---|
| `exp_dbd57a9bf335` | Software Engineer | Nimbus Analytics Pvt Ltd | full_time | Jul 2023 – Present | 40 months (to Oct 2026) | built (40), designed (none), reduced (35%) |
| `exp_535f47639268` | Software Engineering Intern | Orbit Labs | **internship** (the word "Intern") | Jan – Jun 2023 | 6 months | wrote (none) |

- **Project:** Campus Events Portal, tech stack `react, node.js, mongodb` (from the text after `|`)
- **Education:** "B.Tech in Computer Science" → level `bachelor`, field `computer_science`, institution "Example Institute of Technology", 2019–2023, `completed`
- **Skill mentions:** 24 mentions of 13 distinct skills. For example `rest@L8 "REST APIs" experience bullet`, `postgresql@L8 experience bullet`, `docker@L19 skills`.
- **Totals:** professional 40 months; internship 6 months (kept separate)

### 3.4 Resume Health (Stage 12)

All 11 checks pass and no findings are recorded, so the score is **100** and readability is **good**. (A weaker resume scoring 68.6 is worked through in [SCORING_AND_MATCHING.md](SCORING_AND_MATCHING.md#25-worked-example).)

### 3.5 Job profile (Stage 13)

Title "Full Stack Developer at Brightpath Software" (the whole first line); company "Brightpath Software" (from "… at X"); seniority `mid` (basis: 4 years); soft skill `leadership` (from "mentor"). Eleven requirements:

| # | Requirement | Type | Importance | Hard? | Why this importance |
|---|---|---|---|---|---|
| 1 | Build and maintain customer-facing web features. | responsibility | contextual | no | Responsibilities section |
| 2 | Review code and mentor junior developers. | responsibility | contextual | no | Responsibilities section |
| 3 | 4+ years of experience | experience_years | required | yes | Under the "Requirements" section |
| 4 | React | skill | required | yes | Required cue ("required") |
| 5 | Node.js | skill | required | yes | Same statement as React |
| 6 | SQL | skill | required | yes | Required cue ("Must have") |
| 7 | Java | skill | required | yes | Required cue ("required") |
| 8 | Bachelor degree in Computer Science or a related field | education | required | yes | Under "Requirements"; `relatedFieldsAccepted: true` |
| 9 | Work authorization | work_authorization | required | yes (always) | Required cue ("Must") |
| 10 | AWS | skill | preferred | no | Preferred cue ("is a plus") |
| 11 | Docker | skill | preferred | no | Preferred cue ("Familiarity with") |

> **A parser quirk visible in this example.** Requirement 8 lists *two* source statements: the degree line **and** "Must be authorized to work in India." The JD degree pattern also matches the ordinary word **"be"** as the abbreviation "B.E.", so that sentence was read as a bachelor's degree requirement and merged into the existing one. Here it was harmless, but with no degree line in the JD the same sentence would *create* a required bachelor's degree requirement. This is a verified defect; see [KNOWN_LIMITATIONS_AND_ROADMAP.md](KNOWN_LIMITATIONS_AND_ROADMAP.md).

### 3.6 Assessments and evidence (Stages 15 and 16)

| Requirement | Status | Credit | How decided | Evidence (verbatim snippet) |
|---|---|---|---|---|
| React | met | 1.0 | exact match in an experience bullet → strength **strong** | `- Built React dashboards used by 40 internal analysts.` (factors: applied_in_role, quantified_outcome, dated, recent) |
| Node.js | met | 1.0 | exact, experience bullet, strong | `- Designed REST APIs in Node.js and Express backed by PostgreSQL.` |
| SQL | partially_met | 0.9 | **implied**: PostgreSQL implies SQL with weight 0.9 | the same PostgreSQL line (evidence points at what the resume says, not at "SQL") |
| Java | missing | 0 | not found; JavaScript is a forbidden sibling | none. Reason: "Not matched: JavaScript is not Java." |
| 4+ years of experience | insufficient_evidence | 0 (assessment) | Dated full-time roles give 40 months, short of 48; the internship is excluded for general experience | entry header evidence registered for the dated role |
| Bachelor degree in CS… | met | 1.0 | Degree level bachelor ≥ bachelor and field `computer_science` matches exactly | `B.Tech in Computer Science` |
| Work authorization | insufficient_evidence | 0 | No explicit statement in the resume; never inferred | none |
| AWS | missing | 0 | not found | none |
| Docker | met | 1.0 | exact, but only in the skills list → strength **weak** | the skills line |
| 2 responsibilities | not_evaluated | 0 | Responsibilities are not evaluated by any engine stage | none |

The result contains 6 evidence items: the five snippets above plus the experience entry header used by the years evaluator.

**Knockout findings and eligibility:**

| Finding | Kind | Severity | Outcome |
|---|---|---|---|
| `ko_8dcd08caa96a` | years_experience | high | unknown |
| `ko_a6ee53e787b8` | degree | high | passed |
| `ko_91ac2c29da21` | work_authorization | **critical** | **unknown** |

`deriveEligibilityStatus()`: there is no critical `failed` finding, but there is a critical `unknown`, so the status is **`review`** (not a failure; the score is unaffected).

### 3.7 Job Match (Stage 17)

Item weight = type weight × importance weight; credit = assessment credit × evidence-strength factor (for skills), or the measured share (for experience).

| Requirement | Type weight | Importance weight | Item weight *w* | Credit *c* | *w·c* | Points lost |
|---|---|---|---|---|---|---|
| React | 1 | 1 | 1 | 1.0 | 1.0 | 0 |
| Node.js | 1 | 1 | 1 | 1.0 | 1.0 | 0 |
| SQL | 1 | 1 | 1 | 0.9 × 1 (strong) = 0.9 | 0.9 | 1.235 |
| Java | 1 | 1 | 1 | 0 | 0 | 12.346 |
| 4+ years | 2 | 1 | 2 | 40 ÷ 48 = 0.8333 | 1.6667 | 4.115 |
| Bachelor degree | 1.5 | 1 | 1.5 | 1.0 | 1.5 | 0 |
| AWS | 1 | 0.3 | 0.3 | 0 | 0 | 3.704 |
| Docker | 1 | 0.3 | 0.3 | 1 × 0.8 (weak) = 0.8 | 0.24 | 0.741 |
| **Total** | | | **8.1** | | **6.3067** | **22.14** |

Job Match = 100 × 6.3067 ÷ 8.1 = **77.86 → 77.9** (rounded half-up to one decimal). Check: 77.86 + 22.14 = 100. Work authorisation is eligibility-only, and the two responsibilities are `not_evaluated`, so they are excluded from the denominator rather than counted as failures. Confidence: **medium** (one requirement had insufficient evidence, two were not evaluated, and eligibility needs review). `keywordCoverage`: required skills 0.75 (3 of 4 met or partial), preferred 0.5.

### 3.8 Recommendations (Stage 18)

| Priority | Rule | Issue (abridged) | Impact |
|---|---|---|---|
| high | `REC-SKILL-MISSING` | Java is a required skill… "Not matched: JavaScript is not Java." | up to 12.3 Job Match points |
| high | `REC-EXPERIENCE-EVIDENCE` | The job asks for 4+ years (required); dated roles establish about 3.3 years. | up to 4.1 points |
| high | `REC-ELIGIBILITY-UNCONFIRMED` | Work authorisation is required and the resume does not say. "This is not a failure." | affects eligibility, not the score |
| medium | `REC-SKILL-RELATED-ONLY` | SQL required; the resume shows PostgreSQL, which gives partial coverage | up to 1.2 points |
| low | `REC-SKILL-OPTIONAL-MISSING` | AWS is preferred and not found | up to 3.7 points |
| low | `REC-SKILL-WEAK-EVIDENCE` | Docker is only listed, not shown in use | up to 0.7 points |

Every action that suggests adding something carries an integrity note, for example "Only add Java if it truthfully reflects your experience." There are no resume-scope recommendations because Resume Health lost no points.

### 3.9 Stored summary (Stage 20)

```json
{
  "mode": "job_match",
  "summary": {
    "resumeHealth": { "score": 100, "readability": "good" },
    "jobMatch": { "score": 77.9, "eligibility": "review", "hardKnockout": false },
    "recommendations": { "total": 6, "critical": 0, "high": 3 }
  },
  "versions": {
    "schema": "1", "engine": "8.0.0-phase8", "parser": "2.0.0-phase2", "jobParser": "3.0.0-phase3",
    "taxonomy": "2026.1", "matcher": "4.0.0-phase4", "evaluator": "5.0.0-phase5",
    "scoringModel": "6.0.0-phase6", "recommendations": "7.0.0-phase7"
  }
}
```

### 3.10 Timing (one in-process run, not a benchmark)

`ingestResume` 12.1 ms · `ingestJob` 0.9 · `parseResume` 50.8 · `resumeHealth` 6.6 · `parseJob` 22.9 · `match` 3.3 · `evaluate` 11.2 · `jobMatch` 3.9 · `recommendations` 2.9 · **total 114.8 ms**. This was a first (cold) run that includes regular-expression compilation. No load testing has been done.

---

## 4. How different requirement types travel through the pipeline

Requirement types take **different paths**; do not assume every requirement is "matched like a skill".

| Type | Extracted when the JD statement… | Assessed by | Possible statuses | Scored? | Can produce a knockout? |
|---|---|---|---|---|---|
| `skill` | names a taxonomy skill | `matchSkill()` | met, partially_met, missing | yes (required or preferred skills) | no, never |
| `skill_group` | **never produced by the current parser** (the matcher supports it) | `matchSkillGroup()` | n/a | n/a | n/a |
| `experience_years` | has "N+ years", "at least N years", "N-M years", "five years", "entry level", or "N years … experience" | `evaluateExperience()` | met, insufficient_evidence | yes (type weight 2) | yes: high severity, `passed` or `unknown` only |
| `education` | matches a degree pattern | `evaluateEducation()` | met, partially_met, insufficient_evidence | yes (1.5) | yes: high; `passed`, `at_risk` or `unknown` |
| `certification` | names a known certification or "X certified/certification" | `evaluateCertification()` | met, missing | yes (1) | yes: high; `passed` or `unknown` |
| `language` | "fluent/proficient/native … in <known spoken language>" | `evaluateLanguage()` | met, insufficient_evidence | no (eligibility only) | yes: high; `passed` or `unknown` |
| `work_authorization` | "authorized to work", "visa sponsorship", "right to work", … | `evaluateWorkAuthorization()` | met, missing, insufficient_evidence | no | yes: **critical**; `passed`, `failed` or `unknown` |
| `clearance` | "security clearance", "secret clearance", "TS/SCI", … | `evaluateClearance()` | met, missing, insufficient_evidence | no | yes: **critical** |
| `location` | **never produced** (the job's location is read into `jobProfile.location` only) | n/a | n/a | n/a | n/a |
| `responsibility` | any statement in a responsibilities section | not evaluated | not_evaluated | excluded | no |

---

## 5. One end-to-end trace, step by step

**Fictional user:** Ananya Demo (`ananya.demo@example.com`), signed in, with a token in `localStorage`.

1. On `/analyze`, Ananya drops `ananya-cv.pdf` into the dropzone (`react-dropzone` accepts it: PDF, under 10 MB), pastes the JD into step 2, and clicks **"Analyze resume and job match"**.
2. `createAnalysis()` builds `FormData` with `resume` (the file) and `jobText`, and posts it to `/api/v1/analyses` with `Authorization: Bearer …`.
3. Express: `requestContext` assigns a request id; helmet, compression and cors apply; the global limiter counts the request.
4. The router runs `authenticate`, so `req.auth.userId` is Ananya's id; then `analysisRateLimiter`; then multer reads the file into memory; then `validate` checks the body is strict; then `buildAnalysisInput()` produces `{ resume: { file }, job: { text } }`.
5. `analysisService.create()` → `runAnalysis()` fixes the reference date at today (UTC).
6. `ingestFile()`: `validateUpload()` sees `%PDF-` → `extractPdf()` reads text items into lines, page count and links → `normalizeDocument()`.
7. `ingestPastedText(job)` produces a second `NormalizedDocument`.
8. `parseResume()` → sections, contact, two roles, one project, one degree, skill mentions.
9. `assessResumeHealth()` → 11 checks plus content rules → score.
10. `parseJob()` → statements → 11 requirements.
11. `matchRequirements()` → skill statuses; other types are `not_evaluated` for now.
12. `evaluateEligibility()` → evidence objects, final statuses for non-skill types, knockout findings, eligibility `review`.
13. `scoreJobMatch()` → 77.9 plus the gate; `buildRecommendations()` → 6 recommendations.
14. `parseContract(AnalysisResultSchema)` checks every cross-reference → `analysisRepository.create()` inserts one document into `analyses`.
15. The response is `201 { success: true, data: { analysis } }` → the browser navigates to `/results/<id>` → `GET` → tabs render.
16. On the Interview prep tab, "Generate questions" is disabled because `analysis.ai.status` is `unavailable` until `AI_MODEL` is configured on the server.

---

## 6. The 25 end-to-end questions, answered

| # | Question | Answer (real code) |
|---|---|---|
| 1 | What happens from selecting a PDF to seeing results? | Section 5 above. |
| 2 | Which file receives the HTTP request? | The Express app from `server/src/app.js` (started by `server/index.js` → `src/server.js`); the route handler is in `server/src/api/v1/analyses.routes.js`. |
| 3 | Which middleware executes first? | `requestContext` (request id and logging), then `helmet`, `compression`, `cors`, the body parsers and the global rate limiter. On the route: `authenticate` → `analysisRateLimiter` → upload → `validate`. |
| 4 | Where is the request validated? | `validate()` with `CreateAnalysisBodySchema` (`api/v1/schemas/analyses.schemas.js`), then `buildAnalysisInput()`, then `validateUpload()` for file bytes; engine outputs are validated by `parseContract()`. |
| 5 | Where is the PDF extracted? | `extractPdf()` in `server/src/documents/extractors/pdf.js` (pdf.js legacy build). |
| 6 | How is text normalised? | `normalizeLineText()` and `normalizeDocument()` in `documents/normalize.js`: NFKC, invisible characters removed, spaces unified, bullet glyphs lifted, whitespace collapsed, originals kept, SHA-256 hash. |
| 7 | How is the resume profile built? | `parseResume()`: `detectSections()`, `extractContact()`, `buildExperience()`/`buildProjects()`/`buildEducation()`/`buildCertifications()`, `buildSkillMentions()`, `computeTotals()`, `buildDiagnostics()`, validated as `ResumeProfile`. |
| 8 | How are skills identified? | `taxonomy.recognize(line)` with boundary-safe regular expressions over 80 canonical skills, longest match first and no overlaps; ambiguous names need context. |
| 9 | How are aliases resolved? | Every skill's `exact` and `aliases` surfaces are registered in `SURFACE_TO_ID` and `SURFACES` (`taxonomy.js`); `"NodeJS"`, `"node js"` and `"node"` all map to `node.js`. |
| 10 | How are JD requirements created? | `parseJob()` → `detectJobSections()` → `buildStatements()` → `extractRequirements()` (classify importance, run the typed extractors, de-duplicate by `canonicalKey`). |
| 11 | How is each requirement assessed? | Skills: `matchSkill()`/`matchSkillGroup()`. Experience, education, certification, language, work authorisation and clearance: the evaluators in `engine/evaluation/`. Responsibilities: `not_evaluated`. |
| 12 | How is evidence attached? | `createEvidenceRegistry()` turns mentions and entries into `Evidence` objects with verbatim snippets; assessments reference their ids (`best.evidenceIds`); `assertReferentialIntegrity()` checks them. |
| 13 | How is eligibility calculated? | `deriveEligibilityStatus(findings)` in `domain/contracts/eligibility.js`. |
| 14 | How are knockouts determined? | Evaluators emit a `KnockoutFinding` for each hard non-skill requirement. Only an explicit denial of a critical requirement (clearance or work authorisation) is `failed`; silence is `unknown`. |
| 15 | How is Resume Health calculated? | `assessResumeHealth()` + `buildBreakdown()`: five weighted components of graded checks and rules ([formula](SCORING_AND_MATCHING.md#2-resume-health)). |
| 16 | How is Job Match calculated? | `scoreJobMatch()`: the weighted average of requirement credits ([formula](SCORING_AND_MATCHING.md#3-job-match)). |
| 17 | How are recommendations generated? | `buildRecommendations()` from Resume Health deductions (`resumeRules.js`) and assessments and findings (`jobRules.js`); sorted and grounded. |
| 18 | What is saved in MongoDB? | One `analyses` document: `userId`, `mode`, `resume` and `job` descriptors, `summary`, `versions`, `result`, `ai`, timestamps. No file and no full text. |
| 19 | What does the API return? | `toAnalysisView()`: `id, createdAt, mode, resume, job, summary, versions, result, ai` inside the success envelope. |
| 20 | How does React display it? | `ResultsPage` → `ScoreOverview`, `RequirementsTab`, `ImprovementTab`, `ResumeHealthTab`, `InterviewPrepTab`. |
| 21 | What happens when AI is unavailable? | `createAiProvider()` returns `null`; analyses work normally; `ai.status` is `unavailable`; AI calls return `200` with `status: unavailable`, `reason: not_configured`; the UI disables "Generate questions". |
| 22 | What happens when parsing fails? | An `AppError` (for example `UNPROCESSABLE_DOCUMENT` with `details.reason` and `details.document`) → error envelope → the UI shows the message; nothing is stored. |
| 23 | What if a user requests someone else's analysis? | The repository query includes `userId`, so nothing is found → `404 NOT_FOUND`, the same as a missing id. |
| 24 | How does deletion work? | `DELETE` → `deleteOwned()` → `deleteOne({ _id, userId })` → `204`; AI results are inside the same document and go with it. |
| 25 | How do tests verify the pipeline? | 21 Jest suites: unit tests per stage, real-file ingestion tests, a pipeline test (determinism, single pass, no AI dependency), and HTTP tests through the real middleware with an in-memory MongoDB ([TESTING_AND_VALIDATION.md](TESTING_AND_VALIDATION.md)). |
