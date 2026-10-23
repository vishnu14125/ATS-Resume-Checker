# Testing and Validation

> What is tested, how, what was actually run (with dates), and what has **not** been verified. Results in this document come from runs made on **2026-10-20** unless another date and source are given. Historical results are labelled with their report and date.

---

## 1. Summary

| Check | Result | When and how |
|---|---|---|
| Backend test suite | **21 of 21 suites, 433 of 433 tests passed** (about 82 s) | Run twice on 2026-10-20 (`npx jest --runInBand`, then the same with `--json`) |
| Backend test suite on Node.js 22.20.0 | **22 of 22 suites, 442 of 442 tests passed**, exit code 0 (Jest time about 160 s); adds the 9 `rateLimitProxy` tests | 2026-10-23, `npx jest --runInBand` with a portable Node 22.20.0, locally on Windows; Linux CI not yet run |
| Frontend lint | **Passed** (0 problems) | `npx eslint .` in `client/`, 2026-10-20 |
| Frontend production build | **Passed**: Vite 7.3.6, 1,748 modules, main bundle 299.22 kB (100.41 kB gzip), CSS 53.80 kB | `npx vite build` into a scratch folder (the real `client/dist` was left untouched), 2026-10-20 |
| Engine behaviour probes | Ran; findings recorded below | Scratch scripts calling the real engine, 2026-10-19 and 2026-10-20 |
| In-memory HTTP trace (every endpoint) | Ran; all responses as documented | Real `createApp()` with an in-memory MongoDB and a scripted AI provider, 2026-10-20 |
| Browser QA | **Historical only**: passed on 2026-10-05 | `FINAL_FRONTEND_VALIDATION_REPORT.md`, `FRONTEND_VISUAL_REDESIGN_REPORT.md`; **not re-run** |
| Real AI provider | **Historical only**: one interview-prep run succeeded on 2026-10-05 | Not re-run (it would call an external, rate-limited or paid API) |
| Docker image | **Never built** | Docker is not installed on the development machine |
| GitHub Actions CI | **Not run on the current code as of 2026-10-23** | The code had not yet been pushed to GitHub |

---

## 2. Framework and commands

- **Jest 29.7.0** (backend only), **Supertest 7.2.2** for HTTP, and **mongodb-memory-server 11.2.0** for a throwaway MongoDB per test file (the cached `mongod` 8.2.6 binary is used).
- No Jest configuration file; defaults find `server/test/foundation/*.test.js`.

```bash
cd server
NODE_OPTIONS="--max-old-space-size=4096" npx jest --runInBand          # everything (as CI does)
npx jest test/foundation/scoring.test.js                               # one suite
npx jest -t "Java"                                                     # tests whose name matches
```

`--runInBand` runs suites one after another (each starts its own MongoDB); the 4 GB heap setting follows the CI configuration.

Shared helpers (`server/test/foundation/helpers/`):

| Helper | Role |
|---|---|
| `testApp.js` | `startMemoryDb()`, `buildConfig()` (test JWT secret, auth and analysis limits raised to 1,000), `buildApp({ env, overrides })`, a capturing logger |
| `contractFactories.js` | Builds contract-valid objects (each one is validated against its strict schema) |
| `fixtures.js` | Reads the fixture files; `REFERENCE_DATE = 2026-09-29` |

---

## 3. Test inventory (counts from the Jest JSON report, 2026-10-20; `rateLimitProxy.test.js` added 2026-10-23)

| Suite | Tests | Kind | What it proves |
|---|---|---|---|
| `contracts.test.js` | 37 | Unit (pure) | Every contract accepts valid objects and rejects invalid ones: strictness, id formats, score invariants, eligibility derivation, referential integrity, resume-only vs job-match shapes, JSON Schema export |
| `configAndLogging.test.js` | 9 | Unit | Config defaults; production refuses a missing, short or placeholder `JWT_SECRET` and a missing `MONGO_URI`; logger redaction and levels |
| `apiConventions.test.js` | 11 | HTTP (no database) | Envelopes, malformed JSON, unknown fields, the 72-byte password limit, 404s, request ids, Bearer requirement, 413, health probes, error handler mapping and debug exposure |
| `auth.test.js` | 11 | HTTP + in-memory DB | Register and login, case-insensitive email, the same 401 for both failure kinds, rate limiting, expired, forged, `none`-algorithm and orphaned tokens |
| `ownership.test.js` | 14 | HTTP + in-memory DB | Owner-only lookups, malformed ids, **11 legacy routes return 404**, only two routers mounted |
| `documents.test.js` | 18 | Unit + real files | Validation by bytes, size limits, the zip-bomb guard, lossless normalisation, DOCX HTML → lines, real PDF and DOCX ingestion, scanned-PDF rejection |
| `ingestionRealPath.test.js` | 4 | Real files | Real PDF, DOCX and pasted resume → `ResumeProfile`; critical tokens (C++, C#, emails, %, $) survive |
| `resumeParser.test.js` | 17 | Unit (fixtures) | Contact, sections, education, internships, totals with overlap merging, C/C++/C#, React vs React Native, Node vs Node.js, no invented fields |
| `jobParser.test.js` | 18 | Unit (fixtures) | Title, required vs preferred, years, benefits not turned into requirements, company, ambiguous JD, education, certifications, eligibility, responsibilities, dangerous names, false-inference protection |
| `jobIngestionRealPath.test.js` | 4 | Real files | Real PDF, DOCX and TXT JDs; pasted text converges with files |
| `optionalJd.test.js` | 4 | Unit | Resume-only remains valid; no job is not an error |
| `taxonomy.test.js` | 22 | Unit | Internal consistency, aliases, forbidden pairs, boundary-safe recognition, implications are not equality |
| `matching.test.js` | 12 | Unit | Exact and alias matches, dangerous names not matched, skill groups, missing skills, PostgreSQL → SQL partial, non-skills `not_evaluated`, determinism |
| `eligibility.test.js` | 26 | Unit | Verbatim evidence, no fabricated knockouts, experience from dates only (merging, projects, graduation), education, certification, language, work authorisation, clearance (the knockout boundary), required vs preferred, determinism |
| `scoring.test.js` | 27 | Unit | Resume Health (strong, empty, education-only, projects-only, no skills, poor extraction, embedded instructions) and Job Match (status credits, weighting, eligibility gate, no double counting, bounds, realistic pair) |
| `recommendations.test.js` | 29 | Unit | Resume-only vs job recommendations, priorities, truthful wording, integrity notes, grounding, ordering, determinism |
| `analysisPipeline.test.js` | 18 | Unit (orchestration) | Both modes are contract-valid, cross-references, knockout separate from score, determinism, uploaded = pasted, single pass, **no AI dependency**, injected reference date, failure handling |
| `analysisApi.test.js` | 34 | HTTP + in-memory DB | The full `/api/v1/analyses` surface: modes, uploads (PDF resume + DOCX JD), input not altered (CRLF, more than 10,000 characters), get, delete, list and paging, auth, rate limit, validation, document errors, what is stored, no temp files, no logged content, 500 handling |
| `aiProvider.test.js` | 27 | Unit (fake SDK clients) | AI configuration, provider selection, the Gemini and OpenAI request formats, error mapping, hard timeout, retry policy |
| `groundedAi.test.js` | 75 | Unit (scripted providers) | All 5 tasks, applicability, caching, typed references, unsupported-claim detection, prompt injection, "AI never changes the analysis", failure statuses, data minimisation |
| `aiApi.test.js` | 16 | HTTP + in-memory DB + scripted provider | AI endpoint behaviour, storage, auth and ownership, not-applicable cases, data sent, logging, deletion, separate rate limit |
| `rateLimitProxy.test.js` | 9 | Unit + HTTP + in-memory DB | `TRUST_PROXY` defaults and the production requirement; rotating spoofed `X-Forwarded-For` values cannot evade the login limit; a trusted-proxy case keys on the proxy-appended address |
| **Total** | **442** | | |

---

## 4. Kinds of tests, distinguished

| Kind | Meaning here | Examples |
|---|---|---|
| **Unit (pure)** | Calls engine functions directly with constructed inputs or fixture text; no I/O | `scoring`, `matching`, `contracts` |
| **Real-file ingestion** | Reads actual PDF, DOCX and TXT fixtures through the real extractors | `ingestionRealPath`, `jobIngestionRealPath`, `documents` |
| **In-memory database integration** | Real Mongoose models against a throwaway MongoDB | `auth`, `ownership`, `analysisApi`, `aiApi` |
| **Real HTTP (in-process)** | Supertest sends real requests through the **full Express middleware stack** built by `createApp()`, without opening a port | `apiConventions`, `analysisApi`, `aiApi` |
| **Mocked or scripted AI** | AI providers replaced by fakes that return fixed JSON; **no network** | `aiProvider`, `groundedAi`, `aiApi` |
| **Real AI provider smoke test** | `server/scripts/aiProviderSmoke.js`: manual, opt-in, real network | Not part of `npm test`; **not run** in this pass |
| **Browser tests** | Real Chrome driven by scripts outside the repository | Historical (2026-10-05); no browser test code is committed |

Important caveats:

- A passing unit test with **hand-built inputs** does not prove the real pipeline produces those inputs. Example: test (18) in `eligibility.test.js` builds a preferred clearance with `isHardConstraint: false`, a combination the real JD parser never produces (it always marks clearance and work authorisation as hard). See section 8.
- In-process HTTP tests exercise the real middleware but not a real network, TLS, a reverse proxy or a real MongoDB server.

---

## 5. Fixtures

All fixtures are fictional (`example.com` emails, 555-style phone numbers). Some fictional employers in the text fixtures borrow real company names.

| Folder | Files |
|---|---|
| `server/test/fixtures/resumes/` | `cse_student.txt`, `software_developer.txt`, `rich_tokens.txt`, `polyglot_tokens.txt`, `unusual_format.txt`, `malformed.txt`, `critical_tokens.pdf`, `generate_critical_pdf.js` |
| `server/test/fixtures/jds/` | `software_engineer.txt`, `frontend_developer.txt`, `backend_developer.{txt,pdf,docx}`, `ambiguous.txt`, `dangerous_tokens.txt`, `education_cert.txt`, `responsibilities_heavy.txt`, `generate_jd_binaries.js` |
| `server/test/fixtures/` | `test_resume.pdf`, `test_resume.docx`, `generate_docx.js` |

> **The PDF fixtures were hidden from git (fixed 2026-10-23).** The root `.gitignore` contains `*.pdf`, so `test_resume.pdf`, `resumes/critical_tokens.pdf` and `jds/backend_developer.pdf` were ignored, and `analysisApi`, `documents`, `ingestionRealPath` and `jobIngestionRealPath` read them; **CI on a fresh checkout would have failed**. `.gitignore` now has explicit exceptions for these three files, so they are included; other PDFs stay ignored.

The generator scripts are one-off helpers and are not run by tests. `generate_critical_pdf.js` needs `pdfkit`, which is not a project dependency.

---

## 6. Experiments run during this documentation pass

These scripts lived in a scratch directory **outside** the repository and called the real code (pure engine functions, or `createApp()` with an in-memory MongoDB). No project file was changed, and no real AI provider or developer database was used.

| Experiment | Outcome |
|---|---|
| Fictional end-to-end trace (resume + JD, reference date 2026-10-19) | Job Match 77.9 (recomputed weighted average 77.859), Resume Health 100, eligibility `review`, 6 recommendations; becomes the worked example in [ANALYSIS_PIPELINE.md](ANALYSIS_PIPELINE.md) |
| Weak resume, resume-only | Resume Health 68.6, with six deductions mapped to six recommendations |
| Same resume as paste, TXT, DOCX and two PDFs | 100, 100, 100, 93.3, 94.8; Job Match 98.9 for all. Root cause traced ([RESUME_AND_JD_PARSING.md §9](RESUME_AND_JD_PARSING.md#9-investigation-why-the-same-resume-scores-differently-as-pdf-and-docx)) |
| Taxonomy edge cases | Java, JavaScript and TypeScript distinct; C, C++ and C# distinct; React vs React Native distinct; **false positives:** "rest", "express", "node", "swift" in ordinary prose |
| JD edge cases | One-line JD gives no requirements; "Qualifications" makes items contextual; About-us skills become requirements; **"be" read as the B.E. degree**, "MS Office" as a master's, "Associate Engineer" as an associate degree; "visa sponsorship" in Benefits becomes a hard work-authorisation requirement |
| Sponsorship interplay | JD offering sponsorship + resume needing sponsorship → `likely_filtered` and a critical recommendation (incorrect) |
| DOCX soft line breaks | Header lines glued; name not found, **wrong email** extracted |
| Date handling | "2020 – 2021" → duration best 13 months, but 24 months used for experience |
| Determinism | Two identical runs → identical results (excluding timings) |
| HTTP trace of every endpoint | All status codes and envelopes as documented in [API_REFERENCE.md](API_REFERENCE.md); a foreign analysis gives 404; AI results stored separately; the result is unchanged by AI; DELETE gives 204 then 404 |
| Security probes | `TRUST_PROXY=1` lets spoofed `X-Forwarded-For` bypass the login limiter; helmet headers present; CORS allow-list works |
| `npm audit` (read-only) | Client production 0; server production 8 (2 critical, 3 high, 3 moderate) |

---

## 7. Verification matrix

✔ = verified by that method · (✔) = historical report only · ✘ = not verified · n/a = not applicable

| Area | Unit tests | In-process HTTP + database | Real files | Browser | Real AI | Notes |
|---|---|---|---|---|---|---|
| Register, login, `/me` | ✔ | ✔ | n/a | (✔) | n/a | |
| Protected routes and 401 redirect | n/a | ✔ (API) | n/a | (✔) | n/a | |
| Ownership (IDOR) | ✔ | ✔ | n/a | (✔) | n/a | |
| Rate limiting | n/a | ✔ | n/a | ✘ | n/a | `TRUST_PROXY` bypass found (2026-10-20); fixed 2026-10-23 and covered by `rateLimitProxy` tests |
| PDF ingestion | ✔ | ✔ | ✔ (small fixtures) | (✔) | n/a | Real-world Word- or LaTeX-exported and multi-column PDFs not tested |
| DOCX ingestion | ✔ | ✔ | ✔ | (✔) | n/a | Soft-break and nested-list defects not covered by tests |
| TXT and paste | ✔ | ✔ | ✔ | (✔) | n/a | |
| Resume parsing | ✔ | ✔ | ✔ | n/a | n/a | Fixture variety is small |
| JD parsing | ✔ | ✔ | ✔ | (✔) | n/a | Degree, sponsorship and about-us false positives not covered |
| Matching and taxonomy | ✔ | ✔ | n/a | (✔) | n/a | |
| Evidence and eligibility | ✔ | ✔ | n/a | (✔) | n/a | |
| Scoring | ✔ | ✔ | n/a | (✔) | n/a | |
| Recommendations | ✔ | ✔ | n/a | (✔) | n/a | |
| Persistence (create, get, list, delete) | n/a | ✔ | n/a | (✔) | n/a | |
| AI tasks and grounding | ✔ (scripted) | ✔ (scripted) | n/a | (✔) mock layout | (✔) interview prep once, 2026-10-05 | Other 4 tasks never exercised in a browser |
| Frontend rendering | ✘ (no component tests) | n/a | n/a | (✔) 1280, 768 and 375 px | n/a | Screen readers and non-Chrome browsers not tested |
| Keyboard accessibility | ✘ | n/a | n/a | (✔) | n/a | Arrow-key tab navigation missing |
| Docker image | ✘ | ✘ | ✘ | ✘ | ✘ | Never built |
| CI workflow | ✘ | ✘ | ✘ | ✘ | ✘ | Never run for the current code |
| Load and performance | ✘ | ✘ | ✘ | ✘ | ✘ | One timing sample only (about 115 ms total) |

---

## 8. Known gaps in the test suite

1. **No tests for the verified defects**: the "be"/"MS"/"Associate" degree false positives, the "visa sponsorship" knockout, DOCX soft line breaks and nested lists, wrapped PDF bullets, and everyday-word skill false positives. Each would make a good regression test when it is fixed.
2. **Hand-built inputs in some unit tests** (for example eligibility test 18) cover combinations the real parser never produces.
3. **No frontend tests** (no React Testing Library or Vitest); UI behaviour depends on manual or scripted browser QA kept outside the repository.
4. **Browser automation is not in the repository**, so the 2026-10-05 QA cannot be re-run by others.
5. **Small fixture corpus**, written by the developers; no real-world resumes (by design, for privacy).
6. **No load or concurrency tests.**
7. **No real-AI tests in CI** (correctly so, for cost and determinism), so provider API changes would only surface manually.
8. **CI gaps**: no lint and no `npm audit` (the missing PDF fixtures were fixed on 2026-10-23; see section 5).

---

## 9. Historical results (for context, not current evidence)

| Date | Source | Result |
|---|---|---|
| 2026-09-28 | `PROJECT_AUDIT_AND_PROBLEM_INVENTORY.md` | Legacy suite: 22 suites and 221 tests passing, but they **did not detect** the broken production path (shape-only assertions) |
| 2026-09-26 | `PHASE_5J_…_REPORT.md` and others | "232/232 across 23 suites" (legacy V2 suite; the audit later found this figure stale) |
| 2026-10-04 | Implementation notes (Phases 9 to 11; not in the repository) | 43 suites and 652 tests before legacy removal; **21 suites and 433 tests after** Phase 11 deleted the legacy tests. This matches today's count. |
| 2026-10-05 | `FINAL_FRONTEND_VALIDATION_REPORT.md` | Browser QA passed at 3 widths with real PDF and DOCX; real Gemini interview prep passed on the second attempt; lint and build passed; client `npm audit` 0 at that time |
| 2026-10-05 | `FRONTEND_VISUAL_REDESIGN_REPORT.md` | 41 browser checks at each of 3 widths passed; real AI not exercised (provider rate-limited; mocked layout only) |
