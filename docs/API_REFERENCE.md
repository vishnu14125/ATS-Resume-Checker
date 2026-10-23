# API Reference

> Every endpoint the current server mounts, generated from the route files, the Zod request schemas and the response helpers. **Examples are real responses** captured on 2026-10-20 by running the actual Express app (`createApp`) against an in-memory MongoDB with fictional data. Long values are abridged (`…`); tokens and ids are shortened or replaced with placeholders.
>
> Code: `server/src/api/` (routes, middleware, schemas), `server/src/api/http/respond.js` (success envelope), `server/src/api/middleware/errorHandler.js` and `server/src/shared/errors.js` (error envelope).

---

## 1. Basics

| Item | Value |
|---|---|
| Base URL (local) | `http://localhost:5000` (port from `PORT`) |
| Versioned API | `/api/v1/…` |
| Health | `/api/health`, `/api/health/live`, `/api/health/ready` |
| Formats | JSON (`application/json`), or `multipart/form-data` for analysis uploads |
| Authentication | `Authorization: Bearer <accessToken>` on every `/api/v1` route except register and login |
| Request id | Every response has `X-Request-Id`. Send your own (8 to 128 characters from `A-Z a-z 0-9 . _ : -`) to correlate logs; otherwise a UUID is generated. |
| Rate-limit headers | `RateLimit: limit=…, remaining=…, reset=…` and `RateLimit-Policy: …;w=900` (IETF draft-7 format) |
| CORS | Only origins in `CORS_ORIGINS` (comma-separated) or `CLIENT_URL` receive CORS headers; credentials are allowed |
| Mounted routers | Exactly two: `/api/health` and `/api/v1` (tested). All legacy routes (`/api/upload`, `/api/analyze`, `/api/resumes`, `/api/career`, `/api/export`, `/api/auth/*`) return `404`. |

### Rate limits (per client IP, in memory; reset on restart)

| Limiter | Applies to | Default |
|---|---|---|
| Global | every `/api/*` request, including health checks | 500 per 15 min |
| Auth | `POST /auth/register`, `POST /auth/login` | 10 per 15 min |
| Analysis | `POST /analyses` | 30 per 15 min |
| AI | `POST /analyses/:id/ai` | 30 per 15 min |

The client IP comes from Express's `trust proxy` setting (`TRUST_PROXY`, default `0` outside production; production refuses to start without an explicit value). Set it to the real number of reverse proxies in front of the server (`0` if it is reached **directly**). A value higher than the real number lets clients spoof `X-Forwarded-For` and bypass the per-IP limits; the bypass with the former default of `1` was verified on 2026-10-20 (see [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md)).

---

## 2. Response envelopes

**Success** (`sendSuccess()`):

```json
{ "success": true, "data": { … } }
```

**Failure** (`createErrorHandler()`):

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "requestId": "bdf5f6b4-dad7-4963-93f8-2cee8e9c71d1",
    "details": { "issues": [ { "path": "body.email", "message": "Enter a valid email address.", "code": "invalid_format" } ] }
  }
}
```

- `details` is present only when there is something to add (validation issues, `document`, `reason`, `field`).
- `debug` (`{ name, message, stack }`) is added **only for 500 errors in `NODE_ENV=development`**.
- Exceptions to the envelope: `GET /api/health` returns a plain object, and `DELETE` returns `204` with an empty body.

### Error codes (closed set, `server/src/shared/errors.js`)

| HTTP | Code | Typical cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Schema failure, unknown field, malformed JSON, both a file and text for one document, bad paging |
| 401 | `UNAUTHENTICATED` | Missing, malformed or forged token; a token for a deleted account |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password (the same response for both) |
| 401 | `TOKEN_EXPIRED` | The JWT has expired |
| 403 | `FORBIDDEN` | Never thrown by application code (ownership failures return 404); only used if a library error carrying status 403 reaches the error handler |
| 404 | `NOT_FOUND` | Unknown route; a missing, foreign or malformed analysis id |
| 409 | `EMAIL_TAKEN` | Registration with an existing email (case-insensitive) |
| 409 | `CONFLICT` | Never thrown by application code; only used if a library error with status 409 reaches the error handler |
| 413 | `PAYLOAD_TOO_LARGE` | File over 10 MB, TXT over 1 MB, oversized DOCX XML, text over the character limits, JSON body over `JSON_BODY_LIMIT` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Content is not a PDF, DOCX or text file (by bytes) |
| 422 | `UNPROCESSABLE_DOCUMENT` | Encrypted, corrupt, image-only, over 15 pages, or empty document (`details.reason`) |
| 429 | `RATE_LIMITED` | Rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Anything unexpected, including a contract violation or a database error. The message is generic; details go to the logs only. |
| 503 | `NOT_READY` | `/api/health/ready` while the database is disconnected |

---

## 3. Endpoint summary

| Method | Path | Auth | Success | Implementation |
|---|---|---|---|---|
| GET | `/api/health` | none | `200` plain `{ status, message, timestamp }` | `api/health.routes.js` |
| GET | `/api/health/live` | none | `200 { status: "live" }` | `api/health.routes.js` |
| GET | `/api/health/ready` | none | `200 { status: "ready", checks }` / `503` | `api/health.routes.js` |
| POST | `/api/v1/auth/register` | none | `201 { user, accessToken }` | `api/v1/auth.routes.js` |
| POST | `/api/v1/auth/login` | none | `200 { user, accessToken }` | `api/v1/auth.routes.js` |
| GET | `/api/v1/me` | Bearer | `200 { user }` | `api/v1/me.routes.js` |
| POST | `/api/v1/analyses` | Bearer | `201 { analysis }` | `api/v1/analyses.routes.js` |
| GET | `/api/v1/analyses` | Bearer | `200 { items, nextCursor }` | `api/v1/analyses.routes.js` |
| GET | `/api/v1/analyses/:analysisId` | Bearer | `200 { analysis }` | `api/v1/analyses.routes.js` |
| DELETE | `/api/v1/analyses/:analysisId` | Bearer | `204` (no body) | `api/v1/analyses.routes.js` |
| POST | `/api/v1/analyses/:analysisId/ai` | Bearer | `200 { ai }` | `api/v1/analyses.routes.js` |

---

## 4. Health

### `GET /api/health`

Simple liveness, **not** in the standard envelope.

```json
{ "status": "OK", "message": "Health check passed!", "timestamp": "2026-10-20T15:34:02.384Z" }
```

### `GET /api/health/live`

```json
{ "success": true, "data": { "status": "live" } }
```

Used by the Dockerfile `HEALTHCHECK`.

### `GET /api/health/ready`

`200 { "success": true, "data": { "status": "ready", "checks": { "database": "up" } } }`, or `503 NOT_READY` with `details: { checks: { database: "down" } }` when Mongoose's connection state is not "connected".

---

## 5. Authentication

### `POST /api/v1/auth/register`

| | |
|---|---|
| Middleware | `authRateLimiter` → `validate({ body: RegisterBodySchema })` |
| Body (strict) | `name`: string, trimmed, 1 to 100 characters · `email`: string, trimmed, lower-cased, at most 254, valid format · `password`: string, at least 8 characters, **at most 72 bytes** (UTF-8) |
| Success | `201 { user: { id, name, email, createdAt }, accessToken }` |
| Errors | `400 VALIDATION_ERROR` (every bad field listed; unknown keys such as `isAdmin` rejected) · `409 EMAIL_TAKEN` · `429` |
| Service | `authService.register()` (`application/auth/authService.js`) |

Request:

```json
{ "name": "Kiran Placeholder", "email": "Kiran.Placeholder@Example.com", "password": "correct-horse-9" }
```

Response (`201`):

```json
{
  "success": true,
  "data": {
    "user": { "id": "6ad789f03b9758de70c14ff9", "name": "Kiran Placeholder", "email": "kiran.placeholder@example.com", "createdAt": "2026-10-20T15:34:08.449Z" },
    "accessToken": "eyJhbGciOiJI…"
  }
}
```

Invalid body (`400`):

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "The request is invalid.", "requestId": "…",
  "details": { "issues": [
    { "path": "body.name", "message": "Name is required.", "code": "too_small" },
    { "path": "body.email", "message": "Enter a valid email address.", "code": "invalid_format" },
    { "path": "body.password", "message": "Password must be at least 8 characters.", "code": "too_small" },
    { "path": "body", "message": "Unrecognized key: \"isAdmin\"", "code": "unrecognized_keys" } ] } } }
```

The access token is a JWT (HS256) with payload `{ id, email }`, signed with `JWT_SECRET` and expiring after `JWT_EXPIRES_IN` (default `7d`). There is no refresh token.

### `POST /api/v1/auth/login`

| | |
|---|---|
| Body (strict) | `email` (as above), `password`: 1 to 1,024 characters |
| Success | `200 { user, accessToken }` |
| Errors | `401 INVALID_CREDENTIALS` ("Invalid email or password.") for both a wrong password and an unknown email · `400` · `429` |

---

## 6. Current user

### `GET /api/v1/me`

`200 { "success": true, "data": { "user": { "id": "…", "name": "Kiran Placeholder", "email": "kiran.placeholder@example.com", "createdAt": "…" } } }`

Errors: no header → `401 UNAUTHENTICATED` ("Authentication is required."); not the Bearer scheme → `401` ("Use the Authorization: Bearer <token> scheme."); invalid token → `401` ("Invalid access token."); expired → `401 TOKEN_EXPIRED`; account deleted → `401` ("This account no longer exists.").

---

## 7. Analyses

All analysis routes require authentication and only ever expose the caller's own analyses. A missing analysis, another user's analysis and a malformed id **all return `404 NOT_FOUND`** ("Analysis not found."), so ids cannot be probed.

### `POST /api/v1/analyses`: create and store an analysis

| | |
|---|---|
| Middleware order | `authenticate` → `analysisRateLimiter` → multer memory upload → `validate({ body: CreateAnalysisBodySchema })` → `buildAnalysisInput()` |
| Content types | `multipart/form-data` or `application/json` |
| Multipart fields | file `resume` **or** text `resumeText` (required, one of them); optional file `job` **or** text `jobText`; at most one file per field |
| JSON body (strict) | `{ "resumeText": string, "jobText"?: string }` |
| Validation | Text is validated as a string only (not trimmed or altered); a blank field means "not provided"; sending both a file and text for one document → `400`; unknown fields → `400` |
| Limits | Files 10 MB; TXT 1 MB; PDF 15 pages; DOCX 10 MB of declared XML; resume text 100,000 characters; JD text 30,000 characters (checked again after extraction); multipart text fields 1 MB |
| Success | `201 { analysis: AnalysisView }` |
| Errors | `400` · `401` · `413` · `415` · `422` (with `details.reason` and `details.document`) · `429` · `500` |
| Side effects | Exactly one `analyses` document is inserted on success; nothing is stored on any failure; no temporary files |
| Service | `analysisService.create()` → `runAnalysis()` → `analysisRepository.create()` |

Examples:

```bash
# JSON, resume only
curl -X POST http://localhost:5000/api/v1/analyses \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"resumeText":"Kiran Placeholder\nkiran.placeholder@example.com\n\nEXPERIENCE\n…"}'

# Multipart: resume file plus pasted job description
curl -X POST http://localhost:5000/api/v1/analyses \
  -H "Authorization: Bearer $TOKEN" \
  -F "resume=@kiran-cv.pdf" -F "jobText=<job-description.txt"
```

Response (`201`, multipart run with a TXT resume and pasted JD; `result` abridged):

```json
{
  "success": true,
  "data": {
    "analysis": {
      "id": "6ad789f53b9758de70c15001",
      "createdAt": "2026-10-20T15:34:13.296Z",
      "mode": "job_match",
      "resume": { "kind": "txt", "fileName": "kiran-cv.txt", "sizeBytes": 937, "textHash": "570616198bb3…6143" },
      "job": { "kind": "paste", "fileName": null, "sizeBytes": null, "textHash": "4aac0590bb9e…8e63",
               "title": "Backend Developer at Example Freight", "company": "Example Freight" },
      "summary": {
        "resumeHealth": { "score": 100, "readability": "good" },
        "jobMatch": { "score": 80, "eligibility": "clear", "hardKnockout": false },
        "recommendations": { "total": 2, "critical": 0, "high": 1 }
      },
      "versions": { "schema": "1", "engine": "8.0.0-phase8", "parser": "2.0.0-phase2", "jobParser": "3.0.0-phase3",
                    "taxonomy": "2026.1", "matcher": "4.0.0-phase4", "evaluator": "5.0.0-phase5",
                    "scoringModel": "6.0.0-phase6", "recommendations": "7.0.0-phase7" },
      "result": { "schemaVersion": "1", "mode": "job_match", "engine": { … }, "referenceDate": "2026-10-20",
                  "resume": { "resumeVersionId": null, "resumeTextHash": "…" },
                  "job": { "jobId": null, "jobTextHash": "…", "jobProfileRevision": 1 },
                  "jobMatch": { … }, "evidence": [ … ], "resumeHealth": { … }, "recommendations": [ … ],
                  "diagnostics": { "timingsMs": { … }, "warnings": [] } },
      "ai": { "status": "unavailable", "provider": null, "model": null, "results": [] }
    }
  }
}
```

(The trace that produced this used a scripted AI provider, so its `ai.status` was `available`. With AI not configured, as in the local `.env`, it is `unavailable` as shown.)

Error examples:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "The request is invalid.", "requestId": "…",
  "details": { "issues": [ { "path": "body.resume", "message": "A resume is required: upload a file in the \"resume\" field or send \"resumeText\".", "code": "custom" } ] } } }
```

```json
{ "success": false, "error": { "code": "UNSUPPORTED_MEDIA_TYPE",
  "message": "This file is named like a PDF but its content is not a valid PDF.", "requestId": "…", "details": { "document": "resume" } } }
```

```json
{ "success": false, "error": { "code": "UNPROCESSABLE_DOCUMENT", "message": "The text file is empty.", "requestId": "…",
  "details": { "reason": "no_text_layer", "document": "resume" } } }
```

### `GET /api/v1/analyses`: history (summaries)

| | |
|---|---|
| Query (strict) | `limit`: integer 1 to 50, default 20 · `cursor`: a 24-character hex id (the `nextCursor` of the previous page) |
| Success | `200 { items: AnalysisSummary[], nextCursor: string \| null }`, newest first |
| Paging | `nextCursor` is the id of the last item when more exist; pass it as `cursor` to get strictly older items. `null` on the last page. |
| Errors | `400` (for example `limit=500` → `query.limit: Too big: expected number to be <=50`) · `401` |
| Projection | `result`, `ai` and `userId` are never loaded for the list |

```json
{ "success": true, "data": { "items": [ {
  "id": "6ad789f53b9758de70c15001", "createdAt": "2026-10-20T15:34:13.296Z", "mode": "job_match",
  "resume": { "kind": "txt", "fileName": "kiran-cv.txt", "sizeBytes": 937, "textHash": "…" },
  "job": { "kind": "paste", "fileName": null, "sizeBytes": null, "textHash": "…", "title": "Backend Developer at Example Freight", "company": "Example Freight" },
  "summary": { "resumeHealth": { "score": 100, "readability": "good" }, "jobMatch": { "score": 80, "eligibility": "clear", "hardKnockout": false },
               "recommendations": { "total": 2, "critical": 0, "high": 1 } },
  "versions": { … } } ],
  "nextCursor": "6ad789f53b9758de70c15001" } }
```

The frontend requests `limit=50` and does not follow `nextCursor` (a known UI limitation).

### `GET /api/v1/analyses/:analysisId`

| | |
|---|---|
| Params (strict) | `analysisId`: string, 1 to 64 characters (any non-ObjectId string gives `404`, not `400`) |
| Success | `200 { analysis: AnalysisView }`, exactly as stored (not recomputed), plus the current AI availability and stored AI results |
| Errors | `401` · `404 NOT_FOUND` (missing, foreign or malformed) |

### `DELETE /api/v1/analyses/:analysisId`

`204 No Content` with an empty body. Permanent; stored AI results are removed with it. Errors: `401`; `404` (missing, foreign, malformed, or already deleted; another user's analysis is left untouched).

### `POST /api/v1/analyses/:analysisId/ai`: run one AI task

| | |
|---|---|
| Middleware | `authenticate` → `aiRateLimiter` → `validate({ params, body })` |
| Body (strict) | `task`: one of `resume_explanation`, `job_match_explanation`, `recommendation_wording`, `interview_prep`, `bullet_suggestions` · `regenerate`: boolean, default `false` |
| Success | **Always `200 { ai: AiTaskResult }`** for a valid, owned analysis, whatever the AI outcome |
| Errors | `400` (unknown task: "task must be one of: …") · `401` · `404` · `429` |
| Behaviour | Returns a stored completed result without a model call unless `regenerate: true`; stores only completed results |

Statuses, reasons and a full example: [AI_INTEGRATION.md](AI_INTEGRATION.md#5-request-lifecycle-groundedaiserviceruntask).

---

## 8. Data shapes

These are domain contracts from `server/src/domain/contracts/`. All objects are strict, keys are never omitted, and `null` means "looked for, not found".

### 8.1 `AnalysisView` (GET one, POST create) and `AnalysisSummary` (list)

| Field | Type | Notes |
|---|---|---|
| `id` | string (24 hex characters) | MongoDB ObjectId |
| `createdAt` | ISO date-time | |
| `mode` | `"resume_only"` \| `"job_match"` | |
| `resume` | `{ kind: "pdf"\|"docx"\|"txt"\|"paste", fileName: string\|null, sizeBytes: number\|null, textHash: sha256 }` | `fileName` is a display name only (path and control characters removed, at most 200 characters) |
| `job` | as `resume`, plus `title`, `company` (string \| null); or `null` | |
| `summary` | `{ resumeHealth: { score, readability }, jobMatch: { score, eligibility, hardKnockout } \| null, recommendations: { total, critical, high } }` | |
| `versions` | `{ schema, engine, parser, jobParser, taxonomy, matcher, evaluator, scoringModel, recommendations }` | Stages that did not run are `null` |
| `result` | `AnalysisResult` | **View only** (not in summaries) |
| `ai` | `{ status: "available"\|"unavailable", provider, model, results: AiTaskResult[] }` | **View only**; results are completed tasks only |

### 8.2 `AnalysisResult` (`analysis.js`)

| Field | Type |
|---|---|
| `schemaVersion` | `"1"` |
| `mode` | `"resume_only"` \| `"job_match"` (discriminated union) |
| `engine` | `{ version, parserVersion, taxonomyVersion, scoringModelVersion, recommendationsVersion, jobParserVersion (null in resume_only) }` |
| `referenceDate` | `YYYY-MM-DD` (UTC day used for "Present" and recency) |
| `resume` | `{ resumeVersionId: null, resumeTextHash }` |
| `job` | `null` \| `{ jobId: null, jobTextHash, jobProfileRevision: 1 }` |
| `jobMatch` | `null` \| `{ requirements: Requirement[], assessments: RequirementAssessment[], eligibility: Eligibility, score: ScoreBreakdown, keywordCoverage: { required, preferred }, projectRelevance: [] }` |
| `evidence` | `Evidence[]` (empty in resume_only) |
| `resumeHealth` | `ResumeHealthReport` |
| `recommendations` | `Recommendation[]` |
| `diagnostics` | `{ timingsMs: { ingestResume, parseResume, resumeHealth, …, total }, warnings: string[] }` |

`resumeVersionId` and `jobId` are always `null` because documents are analysed directly and not stored. `projectRelevance` is always `[]` (feature removed).

### 8.3 `Requirement` (`requirement.js`)

```json
{
  "id": "req_e41c634d56b7", "type": "skill", "canonicalKey": "skill:java", "displayName": "Java", "category": null,
  "importance": "required", "importanceReason": "Statement uses a required cue (\"required\").", "isHardConstraint": true,
  "params": { "kind": "skill", "skillId": "java" },
  "sourceStatementIds": ["stm_1aaa3773757a"], "sourceText": "Java is required.", "extractedBy": "rules", "confidence": 0.98
}
```

`type` is one of `skill`, `skill_group`, `experience_years`, `education`, `certification`, `language`, `work_authorization`, `clearance`, `location`, `responsibility` (the parser currently produces neither `skill_group` nor `location`). `params` is a discriminated union whose `kind` equals `type`.

### 8.4 `RequirementAssessment` and `MatchResult` (`match.js`)

```json
{
  "requirementId": "req_c2daf5284d28", "status": "met",
  "statusReason": "Exact canonical skill match: Node.js (found in experience).", "credit": 1,
  "best": { "method": "exact", "matchedSkillId": "node.js", "relation": null, "semantic": null,
            "evidenceIds": ["ev_0f5ce094b376"], "strength": "strong", "methodFactor": 1, "strengthFactor": 1,
            "confidence": 0.98, "explanation": "Exact canonical skill match: Node.js (found in experience)." },
  "alternatives": [], "details": { "kind": "none" }, "confidence": 0.98
}
```

- `status`: `met` · `partially_met` · `missing` · `insufficient_evidence` · `not_evaluated`. A `met` or `partially_met` assessment **must** have `best`; the other statuses must have `credit: 0`.
- `best.method`: `exact`, `normalized`, `alias` or `implied` in practice (`category` and `semantic` exist in the contract but are never produced). `relation` is set for `implied`, for example `{ type: "implies", from: "postgresql", to: "sql", weight: 0.9 }`.
- `details.kind`: `none`; `years` (`requiredMonths`, `demonstrated`, `contributingEntryIds`, `basis`); `education` (`bestEntryId`, `levelMet`, `fieldMatch`, `viaEquivalentExperience`); `certification` (`entryId`, `certStatus`).

### 8.5 `Evidence` (`evidence.js`)

```json
{
  "id": "ev_0f5ce094b376", "kind": "bullet", "section": "experience", "entryId": "exp_5e2d6d37aa17",
  "refs": [{ "lineIndex": 4, "start": 6, "end": 13 }],
  "snippet": "• Built Node.js and Express services that process 12,000 orders per day for the logistics dashboard used by regional operations teams across five cities.",
  "skillIds": ["node.js"],
  "dates": { "start": { "year": 2022, "month": 8, "precision": "month" }, "end": null, "isCurrent": true,
             "sourceText": "Aug 2022 - Present", "duration": { "minMonths": 51, "bestMonths": 51, "maxMonths": 51 } },
  "strength": "strong", "strengthFactors": ["applied_in_role", "quantified_outcome", "dated", "recent"]
}
```

### 8.6 `Eligibility` and `KnockoutFinding` (`eligibility.js`)

```json
{
  "status": "clear", "reasons": [],
  "findings": [ { "id": "ko_8dcd08caa96a", "requirementId": "req_d5df6992e7c6", "kind": "years_experience", "severity": "high",
                  "outcome": "passed", "evidenceIds": ["ev_a89f7290eafb", "ev_caf7c0963015"],
                  "explanation": "Employment dates establish ~5.4 years (requirement: 3+). Overlapping roles are merged, not summed.",
                  "confidence": 0.8 } ]
}
```

`status` ∈ `clear` · `review` · `likely_filtered`, derived by `deriveEligibilityStatus()`; a non-clear status must list `reasons`. `kind` ∈ `years_experience`, `degree`, `certification`, `clearance`, `work_authorization`, `location`, `language`, `required_technology` (the last two are not produced by current evaluators). `outcome` ∈ `passed` · `failed` · `at_risk` · `unknown`.

### 8.7 `ScoreBreakdown` (`score.js`): both scores

```json
{
  "kind": "job_match", "scoringModelVersion": "6.0.0-phase6", "score": 80, "scoreReason": null,
  "confidence": { "label": "high", "reasons": [] },
  "components": [ { "id": "required_skills", "status": "evaluated", "statusReason": "3 required skill requirements scored.",
                    "baseWeight": 0.566038, "effectiveWeight": 0.566038, "rawScore": 0.6667, "contribution": 37.74, "maxContribution": 56.6,
                    "items": [ { "subjectId": "req_…", "itemWeight": 1, "credit": 1, "pointsLost": 0 }, … ], "confidence": 0.95 }, … ],
  "deductions": [ { "componentId": "required_skills", "subjectId": "req_e41c634d56b7", "pointsLost": 18.868, "cause": "missing",
                    "message": "Java: Not matched: JavaScript is not Java." }, … ]
}
```

Component ids: Resume Health `parseability`, `structure`, `technical_content`, `impact`, `completeness`; Job Match `required_skills`, `preferred_skills`, `experience`, `education`, `certifications`, `responsibilities`. Component `status` ∈ `evaluated` · `not_applicable` · `not_evaluated`. Deduction `cause` ∈ `missing`, `partial`, `weak_evidence`, `implied_only`, `insufficient_evidence`, `failed_check`, `warning_check`.

### 8.8 `ResumeHealthReport` (`resumeHealth.js`)

`{ version, sourceKind, readability: "good"|"fair"|"poor"|"unreadable", checks: ParseabilityCheck[], findings: ContentFinding[], score: ScoreBreakdown, limitations: string[] }`

- `ParseabilityCheck`: `{ id: "chk_…", checkId, result: "pass"|"warn"|"fail"|"not_applicable", evidence, fix|null, refs }`
- `ContentFinding`: `{ id: "fnd_…", ruleId, area, severity: "high"|"medium"|"low", message, suggestion, refs, evidenceIds }`

### 8.9 `Recommendation` (`recommendation.js`)

```json
{
  "id": "rec_0b9128e8ba7c", "ruleId": "REC-SKILL-MISSING", "scope": "job", "priority": "high", "category": "skills",
  "issue": "Java is a required skill in the job description, but no supporting evidence was found in the resume. Not matched: JavaScript is not Java.",
  "action": "If you have genuine Java experience, state it explicitly in your skills and in the role or project where you used it. If you do not, leave it out; consider learning it, or weigh this gap when deciding whether to apply.",
  "rationale": "Required requirements carry the most weight in the Job Match Score.",
  "requirementIds": ["req_e41c634d56b7"], "evidenceIds": [], "findingIds": [],
  "expectedImpact": { "scoreDelta": 18.9, "scoreKind": "job_match", "description": "This requirement accounts for up to 18.9 Job Match points, recoverable only with genuine evidence." },
  "integrityNote": "Only add Java if it truthfully reflects your experience.", "confidence": 0.9
}
```

`scope` ∈ `resume` · `job`; `priority` ∈ `critical` · `high` · `medium` · `low`; `category` ∈ `format`, `parseability`, `technical_content`, `content_quality`, `completeness`, `skills`, `keywords`, `experience`, `education`, `certifications`, `eligibility`. Resume-scope recommendations cannot reference requirements or claim Job Match impact (the contract rejects it).

### 8.10 `AiTaskResult` (`ai.js`)

`{ task, status: "completed"|"failed"|"unavailable"|"not_applicable", reason: string|null, provider, model, promptVersion, generatedAt: ISO|null, output: object|null, droppedItems: integer }`. A `completed` result has no reason, records its provider, model and time, and has an `output` matching the task's schema; any other status has a reason and `output: null`.

---

## 9. Quick reference for the frontend

| Frontend function (`client/src/lib/api.js`) | Request |
|---|---|
| `registerUser(details)` | `POST /api/v1/auth/register` → returns `data.accessToken` |
| `loginUser(credentials)` | `POST /api/v1/auth/login` → `data.accessToken` |
| `getMe()` | `GET /api/v1/me` → `data.user` |
| `listAnalyses()` | `GET /api/v1/analyses?limit=50` → `data.items` |
| `getAnalysis(id)` | `GET /api/v1/analyses/:id` → `data.analysis` |
| `deleteAnalysis(id)` | `DELETE /api/v1/analyses/:id` |
| `createAnalysis({ resumeFile, resumeText, jobText })` | `POST /api/v1/analyses` (always multipart) → `data.analysis` |
| `runAiTask(id, task, regenerate)` | `POST /api/v1/analyses/:id/ai` → `data.ai` |
| `errorMessage(error, fallback)` | Reads `error.details.issues[0].message`, then `error.message`, then the fallback |
