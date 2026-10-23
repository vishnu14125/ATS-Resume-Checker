# API

Base URL: `/api/v1`. All bodies are JSON unless noted.

## Conventions

- **Authentication:** `Authorization: Bearer <accessToken>` on every endpoint except register and login.
- **Success:** `{ "success": true, "data": { ... } }`
- **Failure:** `{ "success": false, "error": { "code", "message", "requestId", "details?" } }`
- **Ownership:** an analysis is visible only to the user who created it. Another user's id, a missing id and a malformed id all return `404 NOT_FOUND`.
- **Unknown fields** in a request are rejected with `400 VALIDATION_ERROR`.

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | invalid or unexpected input |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED` | missing, wrong or expired credentials |
| 404 | `NOT_FOUND` | missing or not owned |
| 409 | `EMAIL_TAKEN` | registration with an existing email |
| 413 | `PAYLOAD_TOO_LARGE` | file or text over the limits |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | not a PDF, DOCX or text file |
| 422 | `UNPROCESSABLE_DOCUMENT` | unreadable, encrypted or image-only document |
| 429 | `RATE_LIMITED` | too many requests |

Limits: files 10 MB (text files 1 MB), 15 PDF pages, 100,000 characters of resume text, 30,000 of job description text.

## Authentication

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password }` (password 8+ characters) | `201 { user, accessToken }` |
| POST | `/auth/login` | `{ email, password }` | `200 { user, accessToken }` |
| GET | `/me` | — | `200 { user }` |

## Analyses

| Method | Path | Response |
|---|---|---|
| POST | `/analyses` | `201 { analysis }` |
| GET | `/analyses?limit&cursor` | `200 { items, nextCursor }` (summaries, newest first) |
| GET | `/analyses/:analysisId` | `200 { analysis }` |
| DELETE | `/analyses/:analysisId` | `204` |
| POST | `/analyses/:analysisId/ai` | `200 { ai }` |

### Create an analysis

A resume is required; a job description is optional. Send each document as a file or as text, not both.

- `multipart/form-data`: file `resume` or field `resumeText`; optional file `job` or field `jobText`.
- JSON: `{ "resumeText": "...", "jobText": "..." }`.

Without a job description the analysis has `mode: "resume_only"` and `result.jobMatch` is `null`.

### The analysis object

```
{
  id, createdAt, mode,                    // "resume_only" | "job_match"
  resume: { kind, fileName, sizeBytes, textHash },
  job:    { kind, fileName, sizeBytes, textHash, title, company } | null,
  summary: { resumeHealth: { score, readability }, jobMatch: { score, eligibility, hardKnockout } | null, recommendations },
  versions: { ... },
  result: {
    resumeHealth: { score, readability, checks, findings, limitations },
    jobMatch: { requirements, assessments, eligibility, score, keywordCoverage } | null,
    evidence: [ ... ],                    // resume snippets referenced by assessments
    recommendations: [ ... ]
  },
  ai: { status, provider, model, results }
}
```

Each requirement assessment has a status of `met`, `partially_met`, `missing`, `insufficient_evidence` or `not_evaluated`. `eligibility.status` is `clear`, `review` or `likely_filtered`; it is reported beside the Job Match score and never changes it.

### AI tasks

Body: `{ "task": "...", "regenerate": false }`. Tasks: `resume_explanation`, `job_match_explanation`, `recommendation_wording`, `interview_prep`, `bullet_suggestions`.

The response is always `200` with `ai.status`:

- `completed`: `ai.output` holds the grounded result; it is stored and returned again without a new model call unless `regenerate` is true.
- `unavailable`: AI is not configured or the provider could not be reached.
- `failed`: the model's answer was rejected (invalid or not grounded in the analysis).
- `not_applicable`: the analysis has no data for this task (for example job tasks on a resume-only analysis).

AI never alters `result`.

## Health

`GET /api/health`, `GET /api/health/live`, `GET /api/health/ready` (503 when the database is down).
