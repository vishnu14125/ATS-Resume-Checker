# Known Limitations and Roadmap

> An honest inventory of the project's status on **2026-10-20**, built from the current source, the test runs and experiments of this documentation pass, and earlier reports (labelled). Nothing listed here was fixed during the documentation work. Priorities:
>
> - **P0**: blocks correct or safe use (or risks losing the project)
> - **P1**: important before a serious public demo or deployment
> - **P2**: meaningful quality improvement
> - **P3**: optional enhancement
>
> The guiding rule for the roadmap: fix correctness, explainability, usability and deployability first. Do not add complexity just to look advanced.

---

## 1. Status at a glance

### 1.1 Working (verified)

Accounts (register, login, `/me`); owner-scoped analyses (create, read, list, delete); PDF, DOCX, TXT and pasted input with content-based validation and limits; lossless normalisation; resume and JD parsing; taxonomy matching with forbidden pairs; evidence; eligibility and knockouts; Resume Health; Job Match; grounded recommendations; optional AI with grounding and injection guards; structured logging with redaction; config validation; health endpoints. Evidence: 433 passing tests, the HTTP trace and the engine experiments (2026-10-20); browser QA (2026-10-05).

### 1.2 Partially working

| Item | What works | What doesn't |
|---|---|---|
| PDF resumes | Text extraction, links, page counts, multi-column *detection* | Structure: wrapped lines and graphic bullets lower Resume Health (section 2, D1) |
| DOCX resumes | Paragraphs, lists, headings, tables | Soft line breaks glue lines (D3); nested lists merge (D4) |
| Rate limiting | Works per IP | The default-`TRUST_PROXY=1` bypass (S1) is fixed, but limits are only correct when `TRUST_PROXY` matches the real proxy count; in-memory and per instance |
| Dashboard history | 50 most recent analyses | No "load more", although the API supports cursors (U1) |
| AI | Interview prep in the UI; four more tasks via the API | Disabled locally until `AI_MODEL` is set; real-provider runs only historical |
| JD parsing | Bulleted JDs with clear sections | False positives (D2, D5, D6), one-line JDs (D8) |

### 1.3 Requires configuration

AI (`AI_PROVIDER`, the key **and** `AI_MODEL`); MongoDB (`MONGO_URI` in production); `JWT_SECRET`; CORS origins; `TRUST_PROXY`; the frontend's `VITE_API_BASE_URL` at build time.

### 1.4 Not tested

Docker image (never built); the CI workflow (never run on this code); real-provider AI in this pass; browsers other than Chrome; screen readers; real devices; real-world resume and JD corpora; load and concurrency; Word- or LaTeX-exported and multi-column PDFs; the four API-only AI tasks through any UI.

---

## 2. Known defects (verified in this pass)

Each defect below was reproduced on 2026-10-20 with the real code (scratch scripts, fictional data). Code references are given; the code was **not** changed.

| ID | Priority | Defect | Evidence and cause | Why it matters | Recommended next step |
|---|---|---|---|---|---|
| **D2** | **P1** | **JD degree false positives.** The word "be" (as in "must be", "will be") is read as the **B.E.** degree; "MS" (as in "MS Office") as a master's; "Associate" (as in "Associate Engineer") as an associate degree. | `DEGREE_REQ` in `engine/text/jdLexicons.js` matches `b\.?e\.?`, `m\.?s…` and `associate` as whole words. A React-only JD containing "You will be working closely with designers" produced a **required Bachelor degree** requirement; a resume without a parsed degree dropped from a would-be 100 to **55** and got a high-priority "add your degree" recommendation. The test "does not invent an education requirement" uses a sentence without "be". | Very common wording in real JDs; wrong requirement, wrong score, misleading advice | Require dotted or capitalised forms, or degree context words ("degree", "bachelor", "in <field>"), for short abbreviations; add regression tests with "must be" and "MS Office" |
| **D3** | **P1** | **DOCX soft line breaks glue text.** A Word paragraph using Shift+Enter (`<w:br/>`) becomes one line with no spaces. | `stripInlineTags()` in `documents/extractors/docx.js` removes `<br />` without inserting a newline or space. A generated DOCX with "Meera Testwell ⏎ meera.testwell@example.com ⏎ +91 …" gave **no name** and the **email `testwellmeera.testwell@example.com`**. | Common in resume header blocks; corrupts contact extraction and Resume Health | Convert `<br>` to a line break (or a space) before stripping tags; add a fixture |
| **D1** | **P1** | **PDF structure reconstruction.** Wrapped bullet continuations start phantom entries; bullets drawn as graphics are not detected. | `reconstructLines()` (one line per row, `isBullet: false`) plus `groupEntries()` ("a non-bullet line after bullets starts a new entry"). The same resume scored 100 as DOCX and paste, **93.3** as a text-bullet PDF and **94.8** as a graphic-bullet PDF; Job Match was unchanged ([RESUME_AND_JD_PARSING.md §9](RESUME_AND_JD_PARSING.md#9-investigation-why-the-same-resume-scores-differently-as-pdf-and-docx)). | PDF is the most common resume format; Resume Health is the headline score | Merge continuation lines (lower-case start, aligned with the bullet text, no date); use x-indentation to detect hanging indents; add the experiment PDFs as fixtures |
| **D5** | **P1** | **"Visa sponsorship" creates a hard work-authorisation requirement**, even when the employer *offers* sponsorship; with a resume stating "require visa sponsorship" the result is `likely_filtered` with a **critical** recommendation. | `WORK_AUTH` in `jdLexicons.js` includes "visa sponsorship"; `extractEligibilityRequirements()` always sets `isHardConstraint: true` for work authorisation and clearance; extraction runs on **every** section, including Benefits. Eligibility test (18) uses a hand-built `isHardConstraint: false`. | A false knockout is the most damaging possible error message | Only treat sponsorship phrases as requirements when negated or required ("no sponsorship", "must not require"); skip Benefits and About sections for eligibility extraction; respect importance for the hard flag; add a parser-level test |
| D4 | P2 | **Nested DOCX lists merge** into the parent bullet ("Built APIsNested item"). | The non-greedy `<li>` regex in `htmlToLines()` stops at the first `</li>`. | Rare in resumes; corrupts those bullets | Parse list items with a small HTML walk, or replace nested `<ul>` with line breaks first |
| D6 | P2 | **Requirements extracted from any section**, for example skills named in "About us" become contextual requirements, and "Founded 12 years ago… experience" became a "12+ years" requirement. | `extractRequirements()` runs every extractor on every statement; only responsibilities are section-gated. | Small weights (0.15), but noisy requirement lists and recommendations | Limit extraction to the title, requirements, preferred, responsibilities and education sections |
| D7 | P2 | **Everyday words recognised as skills**: "rest" → REST API, "express" → Express, "node" → Node.js, "swift" → Swift. | These surfaces are in `taxonomy/data.js` without `ambiguous: true`. | Spurious skill mentions inflate skill counts and can satisfy requirements falsely | Mark them as ambiguous (context required) and bump `TAXONOMY_VERSION` |
| D8 | P2 | **A JD pasted as one line yields no requirements** (Job Match `null`). | The first line is the title; statements are read only from later lines (`buildStatements()`). | Users who paste flattened text get no match | Treat a single long line as content, or sentence-split it; show the `NO_REQUIREMENTS` diagnostic prominently |
| D9 | P2 | **Year-only date ranges are counted at their widest** ("2020 – 2021" = 24 months), while the README says they are not widened. | `monthInterval()` in `engine/evaluation/support.js` uses January and December defaults. | Can over-state experience for year-only resumes | Use the `bestMonths` estimate, or report the uncertainty explicitly |
| D10 | P2 | **"Or equivalent experience" is satisfied by any professional experience** (more than 0 months). | The JD parser sets `equivalentExperienceYears: 0`; `evaluateEducation()` accepts any professional months above 0. | Lenient education matching | Parse a years figure when stated; otherwise report `insufficient_evidence` |
| D11 | P3 | **"Present" uses server local time** while the reference date is UTC midnight; off by one month on the 1st of a month on servers behind UTC. | `parseDateRange()` uses `getFullYear()` and `getMonth()`. | Edge case | Use `getUTCFullYear()` and `getUTCMonth()` |
| D12 | P3 | Cosmetic display names: education field capture cut at 50 characters ("…experience is requi"); a certification requirement named after the whole sentence. | `DEGREE_FIELD`, `CERT_PHRASE` regexes. | Readability | Stop the capture at "or", "and", "is" or punctuation |
| D13 | P3 | `header_footer_content` is a declared check id that is **never computed**; `headerFooterLineIndexes` is always `null`. | `domain/contracts/resumeHealth.js` vs `engine/scoring/resumeHealth.js` | Contract promises more than the code delivers | Implement it (repeated top or bottom lines per PDF page) or remove the id |

---

## 3. Security, privacy and deployment items

| ID | Priority | Item | Why | Next step |
|---|---|---|---|---|
| **S1** | **P0 (before any public deployment)** | **Fixed in code (2026-10-23):** the former default `TRUST_PROXY=1` let clients spoof `X-Forwarded-For` and bypass per-IP rate limits when no proxy was present (verified). The default is now 0 outside production, production refuses to start without an explicit value, blank or invalid values are rejected, and `rateLimitProxy` regression tests cover it | Brute force and analysis or AI abuse | Set and verify the real hop count on the hosting platform; document the topology |
| **S2** | **P0 (before any public deployment)** | HTTPS not configured (no deployment) | Tokens and resumes in transit | Use platform TLS or a reverse proxy |
| S3 | P1 | No account deletion, retention policy or privacy notice; evidence snippets can include contact lines | Personal data | Account deletion that cascades to analyses; a TTL option; a short notice in the UI |
| S4 | P1 | `npm audit` production (2026-10-20): 8 advisories in the server. `proxy-addr` is now patched to 2.0.8 in the lockfile (2026-10-23); `pdfjs-dist` still needs a major upgrade; the `canvas`/`tar` chain is install-time only | Supply chain | Plan the pdf.js upgrade (ESM); rerun the audit |
| S5 | P1 | Tokens cannot be revoked; 7-day lifetime; stored in `localStorage` | A stolen token stays valid | Shorter tokens plus refresh, or a per-user token version |
| S6 | P1 | Stale secrets in the local `server/.env` (`GOOGLE_*`, `GROQ_API_KEY`); the legacy Docker setup may have baked `.env` into images (September audit) | Credential hygiene | Remove unused keys; rotate anything that may have leaked |
| S7 | P2 | No AI consent, quota or budget | Cost and privacy | A disclosure and per-user quota |
| S8 | P2 | Docker image never built; `--env-file server/.env` would run the container in development mode | Unknown build issues | Build once, with a production env file; run the health check |

---

## 4. UI limitations

| ID | Priority | Limitation | Next step |
|---|---|---|---|
| U1 | P2 | Dashboard shows only the 50 most recent analyses (`listAnalyses()` ignores `nextCursor`) | Add "Load more" using `nextCursor` |
| U2 | P2 | A failed AI request is shown only by a toast that disappears | Show an inline status on the Interview prep tab |
| U3 | P2 | The JD can only be pasted (the API also accepts a JD file) | Optional second dropzone |
| U4 | P3 | Arrow-key navigation between result tabs is not implemented | WAI-ARIA tabs keyboard pattern |
| U5 | P3 | Delete uses the browser's `confirm()` | A styled, accessible dialog (optional) |
| U6 | P3 | `keywordCoverage`, the score confidence label and parser `diagnostics.warnings` are returned but not shown | Surface the confidence and parse warnings ("We could not find dates for 1 role") |
| U7 | P3 | Fonts come from Google Fonts (third-party request; fallback offline) | Self-host the fonts |
| U8 | P3 | No screen-reader testing | Test with NVDA or VoiceOver |

---

## 5. Performance limitations

| Item | Note |
|---|---|
| Synchronous, in-request analysis | About 115 ms in one measured run; large PDFs take longer. No queue or worker. Fine for a single instance at student-project scale. |
| In-memory rate limits | Reset on restart; not shared across instances |
| No de-duplication | Re-analysing the same documents stores another copy (the content hashes would allow de-duplication) |
| No caching of results or parsed documents | Not needed at current scale |

---

## 6. Repository and process items

| ID | Priority | Item | Why | Next step (owner's decision) |
|---|---|---|---|---|
| **R1** | **P0** | **The current application was unpublished as of this review (2026-10-23):** `server/src/`, the new tests, the redesigned frontend and `docs/` had not been pushed to GitHub, and `origin/main` was then `6509f03` (2026-02-20). | Until published, a local disk failure could lose the work, and nothing is reviewable or reproducible from GitHub | Commit, push, and confirm a green CI run |
| **R2** | **P0** (with R1) | **Addressed (2026-10-23):** the PDF test fixtures were ignored by `.gitignore` (`*.pdf`); explicit exceptions now include the three fixtures | CI on a fresh checkout would fail four suites without them | Commit them together with the `.gitignore` change |
| R3 | P1 | **Resolved (2026-10-23):** `.mongo_data/` (205 MB of local MongoDB files) had been added by an unpublished local commit. That commit was amended to drop the files before anything was pushed, so no branch history contains them (`origin/main` never did); the folder stays on disk and is ignored | Repository size; possible personal data in history | Keep `.mongo_data/` ignored; never force-add it |
| R4 | P1 | `server/uploads/` (23 leftover files) and `server/real-resume.pdf` on disk | Likely personal data | Review and delete locally |
| R5 | P2 | Many historical reports at the repository root, some overstating readiness ("COMPLETED AND PRODUCTION READY", "Security READY") | Confuses readers | Move them to `docs/archive/` with a note, or delete; keep `docs/` as the source of truth |
| R6 | P3 | Small manifest issues: root `package.json` `"author": "Your Name"`; `tailwindcss` under `dependencies`; unused `@types/*` | Polish | Tidy when convenient |
| R7 | P3 | **Addressed (2026-10-23):** the project was on Node 20 (past end-of-life). It is now pinned to Node 22.20.0 (`.nvmrc`, `engines`, CI, `node:22-slim`) and was validated locally on 22.20.0 | Linux CI and clean install not yet verified | Confirm a green CI run on Linux |

---

## 7. Removed features (deleted in Phase 11, 2026-10-04)

PDF report export · AI bullet optimizer and saved resume versions · learning roadmap · project relevance (the field remains, always `[]`) · multi-JD job sets · Google sign-in · bias dashboard · V1 scoring and the V2 shadow mode · embedding-based semantic matching. These are **not available**; see [FEATURES_AND_WORKFLOWS.md §10](FEATURES_AND_WORKFLOWS.md#10-removed-features) for the evidence. Re-adding any of them is optional (P3) and should only happen if it serves users.

---

## 8. Planned in the redesign plan but not implemented

From `BACKEND_REDESIGN_IMPLEMENTATION_PLAN.md` (2026-09-28). These were proposals; the implementation deliberately took a simpler path.

| Planned | Current reality |
|---|---|
| TypeScript backend (decision D4) | JavaScript with run-time Zod contracts |
| Stored resume versions and jobs, an id-based `AnalysisRequest`, re-analysis and de-duplication | A one-shot `POST /analyses`; documents not stored; the `AnalysisRequest` contract is unused |
| A taxonomy of about 400 to 600 skills, a data-file format, a trie-based tokenizer | 80 skills in a JS data file; regex recognition |
| Calibrated semantic responsibility alignment (embeddings) | Not implemented; responsibilities are `not_evaluated` |
| AI-assisted JD interpretation (quote-validated proposals) | `jobProfile.interpretation.ai.status` is always `not_requested` |
| User corrections of extracted requirements | Not implemented |
| Career artifacts (learning roadmap) and a rebuilt PDF export | Not implemented (features removed) |
| Multi-JD comparison query, resume version comparison | Not implemented |
| OpenAPI documentation, ADR files, docker-compose, Node 24 | Not present |
| AI consent, quotas, a global budget, a kill switch, a deep AI readiness check | Not present |
| Password reset, email verification, account data export | Not present |

---

## 9. Discrepancies between earlier documents and the current code

| Document (date) | Claim | Reality now |
|---|---|---|
| `FINAL_PRODUCT_STATUS.md` (2026-09-22) | "COMPLETED AND PRODUCTION READY", 34 tests | Superseded; the 2026-09-28 audit found the production path broken; the current suite is 442 tests on a rebuilt backend |
| `PHASE_5I/5J` reports (2026-09-26) | Semantic matching with Transformers.js; `/api/analyze`; `pdf-parse`; `ATS_V2_MODE` | All removed; pdf.js and mammoth with deterministic matching only |
| `FINAL_FRONTEND_VALIDATION_REPORT.md` (2026-10-05) | "`GET /api/v1/me` is unused" | Used since the visual redesign (header name, greeting) |
| Same | "`client/.env` is tracked by git" | Not tracked in `HEAD` or the index; ignored by `.gitignore` |
| Same | Client `npm audit`: 0 vulnerabilities | Production still 0; 1 new high advisory in a dev/build dependency (2026-10-20) |
| `PRODUCTION_CHECKLIST.md` (before 2026-10-23) | "Security: READY" | Several gaps (section 3), notably the `TRUST_PROXY` bypass (since fixed) and missing HTTPS; the checklist was corrected on 2026-10-23 (Security PARTIAL) |
| Root `README.md` (before this pass) | `docker run … --env-file server/.env` | That file is a development configuration (see S8) |
| `engine/scoring/README.md` | Year-only dates "not widened"; location as eligibility-only | Widened to full years (D9); location requirements are never created |
| `engine/evaluation/README.md` | Preferred or contextual requirements never produce findings | Not true for work authorisation and clearance (D5) |
| `server/src/README.md` | "Request schemas are strict…" and conventions | Accurate |

---

## 10. Suggested order of work

1. **R1 + R2**: commit the current work on a branch, with the PDF fixtures included, and let CI run.
2. **D2, D3, D5**: the high-frequency or high-impact correctness bugs, each with a regression test.
3. **D1**: PDF continuation-line merging, with the PDF fixtures from this investigation.
4. **S1, S2, S4, S6, S3**: deployment safety and privacy basics; then build and verify the Docker image (S8).
5. **D6, D7, D8, U1, U2**: quality improvements visible to users.
6. Everything else as time allows.
