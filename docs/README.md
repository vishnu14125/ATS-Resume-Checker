# ATS Resume Checker: Documentation Index

This folder is the knowledge base for the project: what it does, how every part works, what has been verified, what is missing, and how to explain it. It was written on **2026-10-20** from the current source code (not from older reports), and checked against test runs, a production build and read-only experiments made the same day.

> **Start here:** read [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) (20 minutes), then [ARCHITECTURE.md](ARCHITECTURE.md), then [ANALYSIS_PIPELINE.md](ANALYSIS_PIPELINE.md).

---

## Suggested reading paths

| Your goal | Read, in this order |
|---|---|
| **Understand the project properly** | Overview → Architecture → Analysis pipeline → Scoring and matching → Parsing → AI → Features → Limitations |
| **Interview tomorrow** | Overview → Interview preparation (Levels 1, 5, 8, 9) → Demo guide → Known limitations |
| **Run it on a new machine** | Setup and user guide (Part A) → Testing → Deployment |
| **Present a demo** | Demo guide → Features → Interview preparation (Level 7) |
| **Work on the code** | Architecture → Analysis pipeline → API reference → Database → Testing → Known limitations |

---

## Document map

| Document | What it covers |
|---|---|
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | The problem, users, principles, Resume Health vs Job Match, why the JD is optional, why AI is separate, scope and non-goals |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers, the verified directory tree, frontend and backend architecture, contracts, 7 Mermaid diagrams (system, two request sequences, authentication, AI, persistence, errors), configuration, logging, deployment |
| [TECH_STACK.md](TECH_STACK.md) | Every dependency with its exact version, where and why it is used, trade-offs and alternatives; `npm audit` snapshot |
| [FEATURES_AND_WORKFLOWS.md](FEATURES_AND_WORKFLOWS.md) | A feature matrix with verification status; each feature from UI to database; removed features with evidence |
| [ANALYSIS_PIPELINE.md](ANALYSIS_PIPELINE.md) | The full call graph; 23 stages with inputs, outputs and failures; a worked example with real engine output; the 25 end-to-end questions answered |
| [SCORING_AND_MATCHING.md](SCORING_AND_MATCHING.md) | Exact formulas and weights for both scores; the taxonomy and boundary-safe matching; evidence; eligibility and knockouts; recommendations; documentation discrepancies |
| [RESUME_AND_JD_PARSING.md](RESUME_AND_JD_PARSING.md) | Validation, the PDF, DOCX and TXT extractors, normalisation, the resume and JD parsers, verified edge cases, the PDF-vs-DOCX investigation, typed errors |
| [AI_INTEGRATION.md](AI_INTEGRATION.md) | The optional AI layer: what it controls, providers, configuration (the `AI_MODEL` issue), tasks, grounding, prompt injection, data minimisation, statuses, examples |
| [API_REFERENCE.md](API_REFERENCE.md) | Every endpoint with validation rules, status codes and real response examples; data shapes |
| [DATABASE_AND_DATA_MODEL.md](DATABASE_AND_DATA_MODEL.md) | The `users` and `analyses` collections, an ER diagram, indexes, ownership queries, lifecycle, what is and isn't stored |
| [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) | A controls inventory with verification labels, privacy data flows, gaps and recommendations |
| [SETUP_AND_USER_GUIDE.md](SETUP_AND_USER_GUIDE.md) | Developer setup, environment variables, troubleshooting; a user guide for every screen |
| [TESTING_AND_VALIDATION.md](TESTING_AND_VALIDATION.md) | The test inventory (22 suites, 442 tests), test kinds, fixtures, experiments, a verification matrix, gaps |
| [DEPLOYMENT_AND_OPERATIONS.md](DEPLOYMENT_AND_OPERATIONS.md) | Docker, static frontend, production configuration, CI, health checks, logs, failures, backups, scaling |
| [KNOWN_LIMITATIONS_AND_ROADMAP.md](KNOWN_LIMITATIONS_AND_ROADMAP.md) | An honest status inventory, verified defects, P0–P3 priorities with next steps, discrepancies with older reports |
| [DEVELOPMENT_HISTORY.md](DEVELOPMENT_HISTORY.md) | From the 2025 MERN app through V2, the audit, redesign phases 1–11 and the 2026-10-05 frontend work |
| [INTERVIEW_PREPARATION.md](INTERVIEW_PREPARATION.md) | Ten levels: elevator pitches to code walkthroughs, 20 design defences, 50 hard questions, honest-defence scripts, a revision sheet, a study plan |
| [DEMO_GUIDE.md](DEMO_GUIDE.md) | A preparation checklist, fictional demo documents, a screen-by-screen script, 5- and 10-minute versions, an AI fallback plan |

Older reports at the repository root (for example `FINAL_PRODUCT_STATUS.md` and the `PHASE_*` reports) and in `brain/` are **historical**. Several describe code that no longer exists. Use [DEVELOPMENT_HISTORY.md](DEVELOPMENT_HISTORY.md) to put them in context. Some report filenames cited in these documents, such as audit reports and implementation plans, may refer to local working notes that are not included in the repository.

---

## How to read status labels

| Label | Meaning |
|---|---|
| **Verified** | Confirmed by running code during this documentation pass (2026-10-20): the backend test suite, read-only engine experiments, an in-process HTTP trace with an in-memory database, frontend lint and build |
| **Verified (historical)** | Confirmed by an earlier dated report (for example browser QA on 2026-10-05); not re-run |
| **Implemented, not verified** | The code exists but was not exercised (for example the Dockerfile) |
| **Partial** | Works, with known gaps |
| **Planned / not implemented** | Appears in plans or contracts only |
| **Removed** | Existed in legacy code; deleted on 2026-10-04 |
| **Known limitation / defect** | Reproduced and documented; **not fixed** |

Code references use **file paths and function names** (for example `server/src/engine/scoring/jobMatch.js` → `scoreJobMatch()`) rather than line numbers, which change.

---

## Glossary

| Term | Meaning in this project |
|---|---|
| **ATS** | Applicant Tracking System: employer software that stores and parses applications and lets recruiters search and filter them |
| **MERN** | MongoDB, Express, React, Node.js |
| **SPA** | Single-page application: the React app loads once and switches pages in the browser |
| **REST / envelope** | Resource-style HTTP API; every `/api/v1` response is `{ success, data }` or `{ success: false, error }` |
| **JWT** | JSON Web Token: a signed token `{ id, email }` (HS256) sent as `Authorization: Bearer …` |
| **bcrypt** | A slow, salted password hash (cost 10 here) |
| **Zod** | A schema validation library; used for requests, configuration, contracts and AI output |
| **Contract** | A strict Zod schema for data crossing a module boundary (`server/src/domain/contracts/`) |
| **`parseContract()`** | Validates a value against a contract and returns the parsed value, or throws `ContractViolationError` |
| **Middleware** | An Express function that runs in order for each request (auth, validation, rate limiting…) |
| **CORS** | Browser rule controlling which websites' scripts may read API responses; set by an allow-list |
| **Rate limit** | A per-IP request cap per time window (`429 RATE_LIMITED`) |
| **`TRUST_PROXY` / `X-Forwarded-For`** | How Express learns the client IP behind proxies; must match the real number of proxies |
| **Multer (memory storage)** | Multipart upload parsing that keeps files in RAM only |
| **Magic bytes** | The first bytes of a file that reveal its true type (`%PDF-`, `PK\x03\x04`) |
| **`NormalizedDocument`** | Lossless line-by-line text of a document, each line with its `original`, plus stats and a hash |
| **NFKC** | Unicode compatibility normalisation (ligatures and full-width characters become standard letters) |
| **`textHash`** | The SHA-256 of the normalised text; identifies a document without storing it |
| **`ResumeProfile` / `JobProfile`** | Parsed structure of the resume and the job description (in memory only, not stored) |
| **Section** | A resume or JD part found by its heading (Experience, Requirements…) |
| **Statement** | One JD bullet or sentence; requirements link back to their statements |
| **Requirement** | One thing a JD asks for: skill, experience years, education, certification, language, work authorisation, clearance, or responsibility |
| **`canonicalKey`** | A requirement's de-duplication key (`skill:react`, `years:general`…) |
| **Importance** | `required` (weight 1), `preferred` (0.3) or `contextual` (0.15) |
| **Hard constraint** | A requirement that can produce a knockout finding |
| **Taxonomy** | The curated list of 80 skills with aliases, ambiguity flags, implications and conflicts (`engine/taxonomy/data.js`) |
| **Canonical id / alias** | A skill's stable id (`node.js`) and its alternative names (`nodejs`, `node`) |
| **Ambiguous skill** | A short or common name (`c`, `go`, `r`, `spring`, `spark`) accepted only with context |
| **Forbidden pair** | Two skills that must never be treated as equivalent (Java ↔ JavaScript, C ↔ C++ ↔ C#, React ↔ React Native…) |
| **Implication** | A one-hop partial-credit relationship (PostgreSQL → SQL at 0.9) |
| **Assessment / status** | The verdict for one requirement: `met`, `partially_met`, `missing`, `insufficient_evidence`, `not_evaluated` |
| **Credit** | 0..1, how much of a requirement or check is satisfied |
| **Evidence** | A verbatim resume line (≤ 300 characters) with an id, used to justify a status |
| **Evidence strength** | `strong` (experience), `moderate` (projects, certifications), `weak` (skills list, summary, education) |
| **Knockout finding** | A record that a hard requirement is `passed`, `failed`, `at_risk` or `unknown` |
| **Eligibility** | `clear`, `review` or `likely_filtered`, derived from findings; separate from the score |
| **Resume Health** | A job-independent 0–100 score: parseability, structure, technical content, impact, completeness |
| **Job Match** | A 0–100 weighted-average score of requirement credits for one job |
| **`ScoreBreakdown`** | Components, items, contributions and deductions; score + deductions = 100 |
| **Deduction** | Points lost by one requirement or check, with a cause and a message |
| **Readability** | `good`, `fair`, `poor` or `unreadable`, from the parseability component |
| **Recommendation** | A prioritised, grounded action derived from a deduction, assessment or finding |
| **Integrity note** | The "only add this if it is true" text on recommendations that suggest adding content |
| **Reference date** | The UTC day fixed per analysis and used for "Present" and recency; makes results reproducible |
| **Deterministic** | The same input (and reference date) always gives the same output |
| **IDOR** | Insecure Direct Object Reference: accessing another user's record by its id (prevented by owner-scoped queries) |
| **Provider port / adapter** | The small AI interface the app depends on, and its Gemini or OpenAI implementations |
| **Structured output** | Asking the model for JSON matching a JSON Schema |
| **Grounding** | Checking AI output against the supplied facts (ids, numbers, skills, names) |
| **Prompt injection** | Document text trying to instruct the AI; withheld and contained |
| **Redaction** | Replacing emails, phone numbers and links with placeholders before sending text to AI |
| **`droppedItems`** | How many AI output items were removed by grounding |
| **mongodb-memory-server** | Starts a temporary MongoDB for tests |
| **Supertest** | Sends HTTP requests to the Express app inside the test process |
| **Cursor pagination** | Paging by "items older than this id" instead of `skip`/`offset` |
| **Projection** | Choosing which fields a MongoDB query returns |
| **Mixed (Mongoose)** | A schema-less field type; used for `result`, whose shape the Zod contract owns |
