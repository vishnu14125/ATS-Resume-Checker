# Backend (`server/src`)

A single Express + MongoDB service organized as a modular monolith. This is the
only backend: `server/index.js` loads `.env` and starts `src/server.js`.

## Layers

| Folder | Responsibility | May depend on |
|---|---|---|
| `config/` | Load and validate environment variables into a frozen config object; fail fast | `zod` |
| `shared/` | Cross-cutting utilities: `AppError` + error codes, structured logger with redaction | nothing app-specific |
| `domain/contracts/` | Canonical data contracts (zod). The single source of truth for data shapes | `zod` only |
| `documents/` | Ingestion: validate → extract (PDF/DOCX/TXT/paste) → lossless `NormalizedDocument` | `domain/`, `shared/` |
| `engine/` | Pure, deterministic ATS analysis. No Express, Mongoose, network or clock | `domain/` |
| `application/` | Use cases (e.g. `authService`). Orchestrates repositories and the engine | `domain/`, `shared/`, repository interfaces |
| `infrastructure/` | MongoDB connection, Mongoose models, ownership-scoped repositories | `mongoose` |
| `api/` | HTTP: middleware, `/api/v1` routers, request schemas, response envelope | `application/`, `shared/` |
| `app.js` | Builds the Express app (no listen, no DB connect) — used by tests | all of the above |
| `server.js` | Bootstrap: config → DB → app → listen → graceful shutdown | `app.js` |

## Canonical contracts

`domain/contracts` defines: `NormalizedDocument`, `ResumeProfile`, `JobProfile`,
`Requirement`, `Evidence`, `MatchResult`, `RequirementAssessment`, `Eligibility`
(+ `KnockoutFinding`), `ScoreBreakdown`, `ResumeHealthReport`, `Recommendation`,
`AnalysisRequest` and `AnalysisResult`.

Rules:

- Objects are strict — unknown keys are rejected.
- Engine outputs use `null` for "looked for, not found"; keys are never omitted.
- Ids are deterministic and prefixed (`req_…`, `ev_…`, `exp_…`), never random.
- Confidence, credits and component scores are 0..1; user-facing scores are 0..100.
- **The job description is optional.** `AnalysisResult.mode` is `resume_only`
  (`job: null`, `jobMatch: null`) or `job_match`. Both always include `resumeHealth`.
- Validate at boundaries with `parseContract(schema, value, name)` and continue
  with the **returned** value, never the input.
- `toJsonSchema(schema)` produces JSON Schema for LLM structured output and API docs.

## `/api/v1` conventions

**Envelope**

```json
{ "success": true, "data": { } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "requestId": "…", "details": { } } }
```

**Validation** — `validate({ body, params, query })` with zod schemas. Handlers read
`req.validated.*` only. Invalid input → `400 VALIDATION_ERROR` with
`details.issues[] = { path, message, code }` (paths are prefixed `body.`, `params.`, `query.`).
Request schemas are strict, so unexpected fields (e.g. `isAdmin`) are rejected.

**Errors** — throw `new AppError(CODE, { message?, details? })`. The error handler maps
everything else: malformed JSON → 400, oversized body → 413, malformed ObjectId → 404,
errors with an explicit 4xx status keep their message, anything else →
`500 INTERNAL_ERROR` with a generic message (the original error is logged with the
request id; debug details only in development).

| HTTP | Codes |
|---|---|
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `EMAIL_TAKEN`, `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `UNPROCESSABLE_DOCUMENT` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |
| 503 | `NOT_READY` |

**Request ids** — every response has `X-Request-Id` (a well-formed incoming id is reused);
the same id appears in error envelopes and logs.

**Authentication** — `Authorization: Bearer <JWT>` (HS256, payload `{ id, email }`). Protected routes use `authenticate`,
which sets `req.auth = { userId, email }`.

**Ownership** — user-owned documents are read with
`findOwnedById(Model, { userId: req.auth.userId, id })`. Another user's id and a
non-existent id both produce `404 NOT_FOUND`.

**Rate limits** — per client IP, in memory (no external store). A global limiter covers
`/api/*`; stricter limiters cover sign-in (`/api/v1/auth/*`), analysis creation and AI requests. All reject with `429 RATE_LIMITED`.

**Input limits** — uploads 10 MB (1 MB for text files), 15 PDF pages, 10 MB of unpacked
XML in a DOCX, 100,000 characters of resume text and 30,000 of job description text.
Oversized input is rejected with `413` before it is parsed.

## Deployment

- Configuration is environment variables only (`server/.env.example` lists them). In
  production the server refuses to start without `MONGO_URI` and a real `JWT_SECRET`
  (32+ characters, not the example placeholder). AI settings are optional.
- `Dockerfile` (repository root) builds the API image; no `.env` file is copied into it.
  MongoDB is external: pass its connection string as `MONGO_URI`.
- The frontend is a static Vite build hosted separately; set `CLIENT_URL` (or
  `CORS_ORIGINS`) to its origin. AI keys exist only on the server.
- Stored per analysis: the result, document metadata and hashes, and validated AI output.
  Uploaded files and full document text are not stored (see `application/analysis/README.md`).

## Endpoints

| Method | Path | Auth | Success |
|---|---|---|---|
| POST | `/api/v1/auth/register` | — | `201 { user, accessToken }` |
| POST | `/api/v1/auth/login` | — | `200 { user, accessToken }` |
| GET | `/api/v1/me` | Bearer | `200 { user }` |
| POST | `/api/v1/analyses` | Bearer | `201 { analysis }` |
| GET | `/api/v1/analyses` | Bearer | `200 { items, nextCursor }` |
| GET | `/api/v1/analyses/:analysisId` | Bearer | `200 { analysis }` |
| DELETE | `/api/v1/analyses/:analysisId` | Bearer | `204` |
| POST | `/api/v1/analyses/:analysisId/ai` | Bearer | `200 { ai }` |
| GET | `/api/health/live` | — | `200 { status: "live" }` |
| GET | `/api/health/ready` | — | `200 { status: "ready" }` / `503 NOT_READY` |

The analysis workflow, request formats, persistence and error mapping are documented in
`application/analysis/README.md`. The optional AI layer (providers, tasks, grounding, privacy,
configuration) is documented in `application/ai/README.md`.

## Tests

`server/test/foundation/` — contract, config/logging, API convention, auth and ownership
tests. They use an isolated in-memory MongoDB and never touch a developer database.
Contract fixtures come from `helpers/contractFactories.js`, which validates every object
it builds against its strict schema.
