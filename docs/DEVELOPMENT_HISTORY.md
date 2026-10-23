# Development History

> How the project reached its current form, reconstructed from git history, the dated reports in the repository, file timestamps and the current code. **Old reports are historical evidence, not proof that a feature still exists.** Where a date or number comes from somewhere other than git or a dated report, the source is named.
>
> Sources: `git log` (40 commits, 2025-07-07 to 2026-09-26); reports at the repository root and in `brain/`; file modification times; version strings in the code (`2.0.0-phase2` … `8.0.0-phase8`, prompt `9.0.1`); working notes kept during the Phase 5 to 11 implementation sessions (not stored in the repository; marked *notes*).

---

## 1. Timeline at a glance

| When | Era | Evidence |
|---|---|---|
| 2025-07-07 → 2025-08-17 | **Era 1:** original MERN app (auth, upload, parsing, keyword analysis) | 38 git commits |
| 2026-02-20 | AI-feedback commit reverted; `origin/main` stops here | commit `6509f03` |
| up to 2026-09-22 | **Era 2:** "AI Career Intelligence Platform" phases 1–5 (career features, 34 tests) | `FINAL_PRODUCT_STATUS.md`, `phase5_implementation_report.md`, `AI_EVALUATION_REPORT.md` |
| 2026-09-23 → 2026-09-26 | **Era 3:** local-first analysis and "ATS Intelligence V2" (phases 5A–5J) | `LOCAL_FIRST_ANALYSIS_AUDIT.md`, `brain/*.md`, `PHASE_5H/5I/5J_*`, commit `d8eb433` (143 files, +12,711 lines; originally `8eb5cf0`, amended on 2026-10-23 to remove `.mongo_data/`, see section 4) |
| 2026-09-28 | **Audit and redesign plan** | `PROJECT_AUDIT_AND_PROBLEM_INVENTORY.md`, `BACKEND_REDESIGN_IMPLEMENTATION_PLAN.md` |
| 2026-09-28 → 2026-10-04 | **Era 4:** backend redesign, phases 1–11 (`server/src`) | file timestamps, code version strings, *notes*; **not committed at the time** |
| 2026-10-05 | **Era 5:** frontend audit, simplification, validation, visual redesign | `FRONTEND_UI_AUDIT.md`, `PHASE_2_IMPLEMENTATION_REPORT.md`, `FINAL_FRONTEND_VALIDATION_REPORT.md`, `FRONTEND_VISUAL_REDESIGN_REPORT.md` |
| 2026-10-20 | This documentation pass (no code changes) | `docs/` |

---

## 2. Era 1: the original MERN application (July–August 2025)

From git history:

- **Accounts:** User and Resume models, Signup and Login pages (2025-07-08 to 07-10), then JWT and Google OAuth login (2025-07-15).
- **UI:** home page and footer (2025-07-30); analysis page layout, drag-and-drop upload, resume and JD preview, form validation (2025-08-07 to 08-08).
- **Upload and parsing:** upload route; PDF parsing, DOCX via mammoth, TXT, a generic `parseDocument` with error handling, text cleaning and file checks (2025-08-11 to 08-12).
- **Validation and security:** request validation, upload checks, "API key validation" and custom rate-limiting middleware (2025-08-13).
- **Analysis:** a resume anonymiser, keyword extraction (later with OpenAI GPT), "semantic and basic similarity", action-verb detection, readability, section detection, ATS issue detection, length analysis, structure validation, keyword and structure scoring (2025-08-14 to 08-17).
- An "AI suggestions and feedback" commit (2025-08-17) was **reverted** on 2026-02-20. That revert is the commit on `origin/main` today.

---

## 3. Era 2: the "AI Career Intelligence Platform" (to 2026-09-22)

Reports from this period describe a platform with interview prep, a learning roadmap, project relevance, multi-JD job sets, a resume optimizer with versions, PDF export and Google OAuth, plus a "Phase 5" production-engineering pass with **34 tests in 5 suites**. `FINAL_PRODUCT_STATUS.md` declared it "COMPLETED AND PRODUCTION READY".

**Why this matters:** the later audit found these claims overstated. Treat this era's reports as a record of intent, not of working features.

## 4. Era 3: local-first and "ATS Intelligence V2" (2026-09-23 → 2026-09-26)

- `LOCAL_FIRST_ANALYSIS_AUDIT.md` (2026-09-23) proposed producing the analysis **without Gemini**, using deterministic local logic (`LocalATSAnalyzer`), with AI as an optional enhancement. This direction survives in today's design.
- The V2 phases (`brain/ATS_V2_5C`–`5F`, `PHASE_5H/5I/5J`) built V2 parsers, a matcher, experience, education, certification and project analysers, a parseability score, an evidence engine, knockouts, recommendations, **embedding-based semantic matching (Transformers.js, MiniLM)**, a production adapter with a "shadow mode" switch (`ATS_V2_MODE`), and a V2 frontend. Reports claimed "232/232 tests" and "production-ready".
- `V1_LEGACY_ROUTING_BUG_REPORT.md` describes the app silently serving **V1** results because `ATS_V2_MODE` was missing, an early sign of the two-pipeline problem.
- All of this was committed in one large commit on 2026-09-26, originally `8eb5cf0` (174 files, +12,721 / −1,000 lines). That commit had also picked up 31 local MongoDB data files (`.mongo_data/`). On 2026-10-23, before it was ever pushed, it was amended to drop them; the result is `d8eb433` (143 files, +12,711 / −1,000 lines), with the same message, author date and parent, and otherwise identical content.

## 5. The audit and the redesign plan (2026-09-28)

`PROJECT_AUDIT_AND_PROBLEM_INVENTORY.md` ran the real code and found, among others:

- **The production path destroyed input:** request middleware collapsed newlines and truncated at 10,000 characters, and the text cleaner deleted `@ + # / – • % $`. The same resume and JD scored **74.34** when called directly but **29.67** through the HTTP path.
- **The V2 stages were disconnected by field-name mismatches**: knockouts and recommendations were always empty, every job was "Unknown Title, 1 month".
- **The V2 results UI was unreachable**, and AI career prompts sent **no user data** (escaped template literals).
- Several flows were hard-broken (sign-up URL, multi-JD, PDF export without authentication).
- **Tests were green (22 suites, 221 tests) but asserted shapes only.**
- Repository hygiene: a committed MongoDB data folder, `.env` probably copied into Docker images, undeclared dependencies, patch scripts that rewrote source.

`BACKEND_REDESIGN_IMPLEMENTATION_PLAN.md` then proposed an evidence-first, deterministic engine with canonical contracts, lossless ingestion, AI only at the edges, honest uncertainty (`insufficient_evidence`, `unknown`, `null` scores) and complete removal of V1. It numbered its phases P0–P11. **The actual implementation used its own numbering** (below), and it deliberately did less than the plan proposed (see §8).

---

## 6. Era 4: the backend redesign, phases 1–11 (2026-09-28 → 2026-10-04)

All of this work is in `server/src/` and `server/test/foundation/` and was **not committed** while it was being developed. Dates are approximate (file timestamps; *notes* for Phases 5–11). Each phase left a version stamp in the code, which is still visible in every stored analysis.

| Phase | Problem it solved | Approach and key files | Decisions | Tests (current suites) | Remaining issues |
|---|---|---|---|---|---|
| **1. Foundation and contracts** (≈ 09-28/29) | No shared vocabulary between modules; fragile bootstrap | `config/env.js`, `shared/errors.js` and `logger.js`, `api/middleware/*`, `application/auth/*`, `api/v1/auth` and `me`, `domain/contracts/*` (13 contract files) | Strict Zod contracts, validated at every boundary; one error envelope; app factory `createApp()` for testability | `contracts`, `configAndLogging`, `apiConventions`, `auth`, `ownership` | Some contract fields are never produced (`semantic`, `skill_group`, `location`, `header_footer_content`) |
| **2. Ingestion and resume parsing** (≈ 09-29) | Destructive cleaning; outdated `pdf-parse` | `documents/*` (validation by bytes, pdf.js, mammoth HTML, lossless normalisation), `engine/resume/*`, `engine/text/*`; parser `2.0.0-phase2` | Never mutate input; keep `original` lines; reject rather than truncate | `documents`, `ingestionRealPath`, `resumeParser` | PDF structure (wrapped lines, graphic bullets); DOCX soft breaks |
| **3. JD parsing** (≈ 10-01) | A 23-term dictionary; no importance or years | `engine/job/*`, `jdLexicons.js`; parser `3.0.0-phase3` | JD optional; requirement model with `canonicalKey` de-duplication and provenance (`sourceStatementIds`) | `jobParser`, `jobIngestionRealPath`, `optionalJd` | Degree, sponsorship and section false positives (verified 2026-10-20) |
| **4. Taxonomy and matching** (≈ 10-01) | Substring confusion (Java and JavaScript) | `engine/taxonomy/*` (80 skills, `2026.1`), `engine/matching/*`; matcher `4.0.0-phase4` | Boundary-safe recognition, forbidden pairs, one-hop partial implications; non-skill types deferred to Phase 5 | `taxonomy`, `matching` | Everyday-word false positives; small coverage |
| **5. Evidence, eligibility, knockouts** (2026-10-03, *notes*) | Knockouts and recommendations always empty in V2 | `engine/evaluation/*`; evaluator `5.0.0-phase5` | **Absence of evidence is not failure**; critical (clearance, work authorisation) vs high severity; a single `deriveEligibilityStatus()` rule | `eligibility` (26) | Work authorisation always hard (see D5) |
| **6. Scoring** (2026-10-03) | Free points; wrong inputs; no deductions | `engine/scoring/*`; model `6.0.0-phase6` | Shared breakdown arithmetic; score = Σ contributions; no free points; components excluded when empty | `scoring` (27) | Weights are design choices, not fitted to outcome data |
| **7. Recommendations** (2026-10-03) | Generic or ungrounded advice | `engine/recommendations/*`; `7.0.0-phase7` | Every recommendation cites a source; truthful-edit rules; integrity notes | `recommendations` (29) | Rule-based wording is uniform |
| **8. Orchestration, persistence, API** (2026-10-03) | V1/V2 hybrid documents; results API hiding data | `application/analysis/*`, `models/Analysis.js`, `repositories/analysisRepository.js`, `api/v1/analyses.routes.js`, `middleware/upload.js`; engine `8.0.0-phase8` | **One-shot** `POST /analyses` (the plan proposed resume and job libraries); store the result, not the documents; `resumeVersionId`/`jobId` nullable; malformed ids → 404; **the knockout never caps the score** (decision closed in this phase) | `analysisPipeline`, `analysisApi` (34) | No de-duplication; `projectRelevance` always `[]` |
| **9. Grounded AI** (≈ 10-03/04) | Ungrounded legacy AI | `application/ai/*`, `infrastructure/ai/*`, `contracts/ai.js`; prompt `9.0.1`; `DELETE /analyses/:id` added | AI on demand only; context from the stored result; deterministic grounding guards; AI failures are statuses, not HTTP errors; no default model | `aiProvider` (27), `groundedAi` (75), `aiApi` (16) | `AI_MODEL` unset locally; *notes* record a real-Gemini run of all five tasks on 2026-10-04 |
| **10. Hardening** (2026-10-04, *notes*) | Deployment and abuse gaps | Production rejects the placeholder `JWT_SECRET`; analysis rate limit; TXT 1 MB and DOCX XML caps; `.dockerignore` excludes nested `.env`; API-only non-root Dockerfile; CI uses `npm ci`; `.gitignore` repaired; non-breaking `npm audit fix` | Smallest correct fixes; no Redis or queues | covered in the suites above | Docker never built; client lint not in CI |
| **11. Legacy removal and frontend migration** (2026-10-04) | Two competing pipelines | Deleted `server/routes`, `services`, `models`, `middleware` and the legacy tests; frontend switched to `/api/v1` through `client/src/lib/api.js`; new result tabs | Remove everything not used by the new path, including features that existed only in legacy code | `ownership` asserts the old routes return 404 | Removed features (§7) |

Test-suite size over time (*notes*, including legacy suites until Phase 11): after Phase 6, 37 suites / 449 tests; Phase 7, 38 / 478; Phase 8, 40 / 525; Phase 9, 43 / 645–647; Phase 10, 43 / 652; **Phase 11, 21 / 433** after deleting the legacy tests. The final figure matches the run on 2026-10-20.

---

## 7. Features removed in Phase 11

PDF export, AI bullet optimizer and saved resume versions, learning roadmap, project relevance, multi-JD job sets, Google sign-in, bias dashboard, V1 scoring and V2 shadow mode, embedding-based semantic matching. They were removed because they lived only in the legacy code, which the audit showed to be broken or ungrounded. Rebuilding them was not part of the redesign's must-have list. Evidence: [FEATURES_AND_WORKFLOWS.md §10](FEATURES_AND_WORKFLOWS.md#10-removed-features).

---

## 8. Plan vs implementation

The implementation intentionally stayed smaller and simpler than `BACKEND_REDESIGN_IMPLEMENTATION_PLAN.md`:

| Plan | Implemented instead | Likely reason |
|---|---|---|
| TypeScript (D4) | JavaScript plus Zod run-time contracts | Lower migration cost; contracts already catch boundary bugs |
| Resume versions, jobs and analyses as separate resources | One-shot analysis; no document storage | Privacy and simplicity (the Phase 8 decision) |
| 400–600 skill taxonomy, trie tokenizer | 80 skills, regular expressions | Accuracy over breadth; enough for software roles |
| Calibrated semantic alignment | Not implemented | Complexity and calibration effort; responsibilities stay `not_evaluated` |
| AI JD interpretation, learning roadmap, consent and quotas | Not implemented | Scope |
| OpenAPI, ADRs, docker-compose, Node 24 | Not implemented | Scope |

---

## 9. Era 5: the frontend (2026-10-05)

| Step | Report | What happened |
|---|---|---|
| UI audit ("frontend Phase 1") | `FRONTEND_UI_AUDIT.md` | An inventory of visual and UX problems and a controlled design direction |
| Simplification ("Phase 2") | `PHASE_2_IMPLEMENTATION_REPORT.md` | `client/src` reduced from **2,165 to 1,227 lines** (22 → 20 files); 3 dependencies removed (`framer-motion`, `autoprefixer`, `@tailwindcss/postcss`); a working mobile menu; a 404 page; one product name; browser QA at 3 widths |
| Final validation | `FINAL_FRONTEND_VALIDATION_REPORT.md` | Real Chrome QA with real PDF and DOCX files and **one real Gemini interview-prep run** (passed on the second attempt after a 503); keyboard checks; client `npm audit fix` (20 → 0 vulnerabilities at the time); the PDF-vs-DOCX Resume Health difference first measured |
| Visual redesign | `FRONTEND_VISUAL_REDESIGN_REPORT.md` | New design system (tokens in `index.css`), redesigned pages; `client/src` grew to **1,873 lines**; `GET /api/v1/me` now used; 41 browser checks at each of 3 widths passed; real AI not exercised (rate-limited) |

---

## 10. Where the repository stands now (2026-10-20)

- `HEAD` = `8eb5cf0` (2026-09-26); `origin/main` = `6509f03` (2026-02-20). (On 2026-10-23 that commit was amended to `d8eb433`; see section 4.)
- Everything from the redesign and the frontend work was **uncommitted** in the working tree: deletions of legacy files, modified files, and untracked `server/src/`, `server/test/foundation/`, new frontend files and reports.
- The removal of `.mongo_data/` from git tracking was **staged** (31 files), but not committed. (Update, 2026-10-23: the unpublished local commit that had added these files was amended to drop them before anything was pushed, so no branch history contains them; `origin/main` never did.)
- `docs/` (this knowledge base) was added on 2026-10-20 and was also uncommitted at that date.

---

## 11. Lessons that shaped the current design

1. **Green tests can hide a broken product**, so tests now run the real path: real files, real HTTP middleware, contract-valid inputs.
2. **Modules must share contracts**, so strict Zod schemas sit at every boundary.
3. **Never mutate user input silently**, so ingestion is lossless and oversized input is rejected with an error instead of truncated.
4. **LLMs should not compute scores**, so AI was moved to an optional, grounded edge.
5. **Absence is not failure**, so `insufficient_evidence` and `unknown` are first-class results.
6. **Fewer, honest features beat many broken ones**, so legacy-only features were removed rather than kept half-working.
