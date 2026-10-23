# Analysis workflow, persistence and API (Phase 8)

One canonical path turns documents into a stored, validated `AnalysisResult`.

```
HTTP (api/v1/analyses.routes.js)
  authenticate → in-memory upload → validate → buildAnalysisInput
        │
        ▼
analysisService.create (application)
        │
        ▼
runAnalysis (application, pure orchestration)
  resume ─► ingest ─► ResumeProfile ──────────────────────────► Resume Health ─┐
  job?   ─► ingest ─► JobProfile ─► match ─► evidence/eligibility ─► Job Match ─┼─► recommendations
                                                                               ▼
                                                    AnalysisResult (contract-validated)
        │
        ▼
analysisRepository.create (infrastructure) → MongoDB `analyses`
```

| Layer | File | Responsibility |
|---|---|---|
| Application | `runAnalysis.js` | Calls the Phase 2–7 modules in order, assembles and validates the `AnalysisResult`. No DB, HTTP or AI. |
| Application | `analysisService.js` | Use cases: create (run + store), get, list. Maps stored documents to public views. |
| Infrastructure | `db/models/Analysis.js`, `repositories/analysisRepository.js` | Storage; every read is owner-scoped. |
| API | `api/v1/analyses.routes.js`, `schemas/analyses.schemas.js`, `middleware/upload.js` | HTTP only: auth, upload, validation, envelope. |

Each document is ingested and parsed once; every engine stage runs once per analysis.

## Modes

- **Resume only** — no job supplied. Result `mode: "resume_only"`, `job: null`,
  `jobMatch: null`: Resume Health and resume-scope recommendations only. No
  JobProfile, Job Match Score or job-scoped recommendation is ever fabricated.
- **Resume + job** — result `mode: "job_match"` with requirements, assessments,
  evidence, eligibility, the Job Match Score and job-scope recommendations, plus
  Resume Health.

## Endpoints (all require `Authorization: Bearer <token>`)

| Method | Path | Success | Errors |
|---|---|---|---|
| POST | `/api/v1/analyses` | `201 { analysis }` | 400, 401, 413, 415, 422 |
| GET | `/api/v1/analyses?limit&cursor` | `200 { items, nextCursor }` | 400, 401 |
| GET | `/api/v1/analyses/:analysisId` | `200 { analysis }` | 401, 404 |
| DELETE | `/api/v1/analyses/:analysisId` | `204` (no body) | 401, 404 |
| POST | `/api/v1/analyses/:analysisId/ai` | `200 { ai }` (see `application/ai/README.md`) | 400, 401, 404, 429 |

**Create — request.** A resume is required; a job description is optional. Each
document is sent as a file *or* as text, never both.

| Form | Resume | Job description |
|---|---|---|
| `multipart/form-data` | file field `resume` or text field `resumeText` | file field `job` or text field `jobText` |
| `application/json` | `resumeText` | `jobText` |

Files: PDF, DOCX or TXT, up to 10 MB, identified by content (not by name or MIME
type). Text limits: resume 100,000 characters, job description 30,000. A blank
text field means "not provided". Unknown fields are rejected.

**Analysis view.**

```json
{ "id": "…", "createdAt": "…", "mode": "job_match",
  "resume": { "kind": "pdf", "fileName": "cv.pdf", "sizeBytes": 48211, "textHash": "…" },
  "job": { "kind": "paste", "fileName": null, "sizeBytes": null, "textHash": "…", "title": "…", "company": "…" },
  "summary": { "resumeHealth": { "score": 86.4, "readability": "good" },
               "jobMatch": { "score": 84, "eligibility": "likely_filtered", "hardKnockout": true },
               "recommendations": { "total": 7, "critical": 1, "high": 2 } },
  "versions": { "schema": "1", "engine": "…", "parser": "…", "jobParser": "…", "taxonomy": "…",
                "matcher": "…", "evaluator": "…", "scoringModel": "…", "recommendations": "…" },
  "result": { /* canonical AnalysisResult */ },
  "ai": { "status": "unavailable", "provider": null, "model": null, "results": [] } }
```

List items are the same view without `result` and `ai`. `ai` reports optional AI enrichment and
is separate from the deterministic `result`; creating or reading an analysis never calls a model.
Deleting an analysis is permanent and removes its AI results. Listing is newest first with
cursor pagination (`limit` 1–50, default 20; `nextCursor` is null on the last page).

## Input is never altered

The API validates that text fields are strings and does nothing else to them: no
trimming, whitespace collapsing, character stripping or truncation. Over-long
input is rejected with 413, never cut. Line structure and characters such as
`+ # @ % $ /` reach ingestion exactly as sent (Phase 2 normalization is the only
normalization, and it is lossless).

## Score and eligibility stay separate

The Job Match Score measures evidence against requirements. Eligibility is a
separate signal. A critical knockout sets `eligibility: "likely_filtered"` and
`hardKnockout: true`; it does not change, cap or duplicate the score.

## Persistence

Collection `analyses`: `userId`, `mode`, `resume` and `job` descriptors, `summary`,
`versions`, `result`, `createdAt`, `updatedAt`. Index `{ userId: 1, _id: -1 }`.

- `result` is the validated `AnalysisResult`; nothing is stored if analysis fails.
- **Not stored:** uploaded files, full document text, parsed profiles, tokens.
  Documents are identified by content hash. The only resume text kept is the
  evidence snippets (≤ 300 characters each) inside the result.
- Uploads are held in memory only; no temporary files are written.
- The analysis id is the MongoDB ObjectId, the same convention as user ids.
- `result.resume.resumeVersionId` and `result.job.jobId` are `null`: documents are
  analysed directly and not stored as resume versions or jobs.

## Ownership

Every read filters by the caller's user id. Another user's analysis, a missing
analysis and a malformed id all return `404 NOT_FOUND`.

## Errors

| Situation | Response |
|---|---|
| Missing resume, both forms sent, unknown field, bad paging | `400 VALIDATION_ERROR` (`details.issues`) |
| Missing or invalid token | `401 UNAUTHENTICATED` / `TOKEN_EXPIRED` |
| Unknown, foreign or malformed analysis id | `404 NOT_FOUND` |
| File or text too large | `413 PAYLOAD_TOO_LARGE` |
| Unsupported file content | `415 UNSUPPORTED_MEDIA_TYPE` |
| Empty, corrupt or text-less document | `422 UNPROCESSABLE_DOCUMENT` (`details.reason`) |
| Result fails contract validation, database failure, anything unexpected | `500 INTERNAL_ERROR`, generic message; cause only in logs |

Document errors carry `details.document` (`"resume"` or `"job"`). A readable but
nearly empty resume is not an error: it is analysed and reported as `unreadable`
with no numeric health score.

## Versioning and determinism

`versions` records the result schema and every engine stage that ran (stages that
did not run are `null`). The reference date is the current UTC calendar day and is
recorded in the result. For the same documents and reference date the analysis is
identical; only the analysis id, `createdAt` and `diagnostics.timingsMs` differ.
No AI service or API key is involved.

## Not implemented

De-duplicating repeat analyses, stored resume versions/jobs
(the id-based `AnalysisRequest` contract), `projectRelevance` (always `[]`).
