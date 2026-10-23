# Features and Workflows

> A catalogue of every user-facing and API-level feature, with where it lives in the code, how data flows, what can go wrong, and how well it has been verified. Status labels are defined in [docs/README.md](README.md#how-to-read-status-labels).
>
> **Evidence sources** referenced below:
> - **[T]** the automated backend tests, all 21 suites and 433 tests passing on 2026-10-20 ([TESTING_AND_VALIDATION.md](TESTING_AND_VALIDATION.md))
> - **[X]** read-only experiments run during this documentation pass against the real engine and an in-memory HTTP stack (scripts kept outside the repository)
> - **[B]** browser QA recorded in `FINAL_FRONTEND_VALIDATION_REPORT.md` and `FRONTEND_VISUAL_REDESIGN_REPORT.md` (both 2026-10-05; **not re-run** in this pass)
> - **[L]** frontend lint and production build, both passing on 2026-10-20

---

## 1. Feature matrix

| # | Feature | Status | Evidence | UI entry | API |
|---|---|---|---|---|---|
| 1 | Registration | Verified | T, X, B | `/signup` | `POST /api/v1/auth/register` |
| 2 | Login | Verified | T, X, B | `/login` | `POST /api/v1/auth/login` |
| 3 | Logout | Verified (historical, browser) | B | Header "Log out" | none (client-side only) |
| 4 | Protected routes and session expiry | Verified | T (API), B (UI) | any protected page | `GET /api/v1/me`, any 401 |
| 5 | Dashboard: latest results and history | Partial: shows the 50 most recent only | T (API), B | `/dashboard` | `GET /api/v1/analyses?limit=50` |
| 6 | Delete an analysis | Verified | T, X, B | Dashboard trash icon | `DELETE /api/v1/analyses/:id` |
| 7 | Resume upload (PDF, DOCX, TXT) | Verified, with a known PDF limitation | T, X, B | `/analyze` dropzone | `POST /api/v1/analyses` (field `resume`) |
| 8 | Resume as pasted text | Verified | T, X, B | `/analyze` textarea | `resumeText` |
| 9 | Optional job description, pasted | Verified | T, X, B | `/analyze` step 2 | `jobText` |
| 10 | Optional job description as a file | Implemented in the **API only** | T | none | field `job` |
| 11 | Resume Health score and report | Verified | T, X, B | Results: Overview, Resume Health | in `result.resumeHealth` |
| 12 | Job Match score and breakdown | Verified | T, X, B | Results: Overview | in `result.jobMatch.score` |
| 13 | Requirement assessments | Verified | T, X, B | Results: Requirements | in `result.jobMatch` |
| 14 | Evidence snippets | Verified | T, X, B | Requirements tab quotes | in `result.evidence` |
| 15 | Eligibility and knockouts | Verified, with a known false-positive defect | T, X | Overview alert, How to improve | `result.jobMatch.eligibility` |
| 16 | Recommendations | Verified | T, X, B | Results: How to improve | `result.recommendations` |
| 17 | AI interview preparation | Implemented and verified with scripted providers; **real-provider run verified once historically** | T, X, B | Results: Interview prep | `POST /api/v1/analyses/:id/ai` with `interview_prep` |
| 18 | Other AI tasks (explanations, rewording, bullet suggestions) | Implemented in the **API only**; not used by the UI | T | none | same endpoint, other `task` values |
| 19 | AI availability reporting and failure handling | Verified | T, X, B | Interview prep tab | `analysis.ai`, task `status` |
| 20 | Persistence and reloading historical results | Verified | T, X, B | open from dashboard or URL | `GET /api/v1/analyses/:id` |
| 21 | Health and readiness endpoints | Verified | T, X | none | `GET /api/health`, `/live`, `/ready` |
| 22 | 404 page and unknown API routes | Verified | T, B | any unknown URL | `404 NOT_FOUND` |
| 23 | PDF export, resume versions, learning roadmap, project relevance, multi-JD sets, Google sign-in, bias dashboard | **Removed** (Phase 11, 2026-10-04) | T (routes return 404), code search | none | none |

---

## 2. Accounts and sessions

### 2.1 Registration

| Aspect | Detail |
|---|---|
| Purpose | Create an account so analyses can be stored privately. |
| User-visible behaviour | Form with full name, email and password ("At least 8 characters"). On success the user lands on `/dashboard` already signed in. Errors appear in a red alert inside the form. |
| UI entry | `/signup` → `client/src/pages/AuthPage.jsx` (`mode="signup"`) |
| API | `POST /api/v1/auth/register`, body `{ name, email, password }` → `201 { user, accessToken }` |
| Frontend | `registerUser()` in `client/src/lib/api.js` returns only the token; `AuthContext.login(token)` stores it in `localStorage`. |
| Backend | `auth.routes.js` → `authRateLimiter` → `validate(RegisterBodySchema)` → `authService.register()` → `userRepository.findByEmail()` (case-insensitive) → `userRepository.create()` → `User` pre-save hook hashes the password with bcrypt (cost 10) → `tokenService.sign()` |
| Model | `User { name, email (unique), password (bcrypt hash), createdAt }` |
| Validation | Name trimmed, 1 to 100 characters. Email trimmed, lower-cased, at most 254 characters and a valid format. Password at least 8 characters and **at most 72 bytes**, because bcrypt ignores everything after the 72nd byte and the API refuses to truncate silently. Unknown fields are rejected. |
| Error states | `400 VALIDATION_ERROR` with every bad field; `409 EMAIL_TAKEN` (also for a different letter case of an existing email); `429 RATE_LIMITED` after 10 auth requests per 15 minutes per IP |
| Verification | [T] `auth.test.js`, `apiConventions.test.js`; [X] in-memory HTTP trace; [B] sign-up in the browser |
| Limitations | No email verification, password reset, password change or account deletion endpoint. |

### 2.2 Login

| Aspect | Detail |
|---|---|
| Behaviour | Email and password. A wrong password and an unknown email give the same message: "Invalid email or password." |
| API | `POST /api/v1/auth/login` → `200 { user, accessToken }` |
| Backend | `authService.login()` compares with bcrypt. If the email is unknown it still compares against a dummy hash, so both failure paths take similar time (this makes it harder to discover which emails are registered by timing responses). |
| Errors | `401 INVALID_CREDENTIALS`, `400`, `429` |
| Verification | [T] `auth.test.js` (same 401 for both cases, case-insensitive email, rate limiting); [X]; [B] |

### 2.3 Logout

Client-side only: `AuthContext.logout()` removes the token from `localStorage`, clears the user, and the header navigates to `/`. There is **no server-side logout or token revocation**; a copied token stays valid until it expires (default 7 days). Verified in the browser [B].

### 2.4 Protected routes, session expiry and the user profile

- `ProtectedRoute.jsx` redirects to `/login` when no token is stored. It does not check whether the token is valid.
- An invalid or expired token is detected by the server (`authenticate` middleware returns `401 UNAUTHENTICATED` or `401 TOKEN_EXPIRED`). The axios interceptor in `AuthContext.jsx` then logs out and does a full-page redirect to `/login`, except for 401s from `/auth/` endpoints.
- `GET /api/v1/me` returns `{ user: { id, name, email, createdAt } }`. The header and dashboard greeting use it for display only. An earlier report (2026-10-05, final validation) said `/me` was unused; that is **outdated**, because the visual redesign the same day started using it.
- Signed-in users who open `/`, `/login` or `/signup` are redirected to `/dashboard`.

---

## 3. Dashboard and history

| Aspect | Detail |
|---|---|
| Purpose | Show where the user stands and every saved analysis. |
| User-visible behaviour | A greeting with the first name; "Your latest results" with the latest Resume Health, the latest Job Match (or a prompt to try one) and a "What to improve next" panel with recommendation counts; then "Recent analyses" with one row per analysis showing title, file name, type badge, date, eligibility badge (only when not `clear`), score rings and a delete button. New users see a three-step explainer and an empty state. |
| UI entry | `/dashboard` → `client/src/pages/DashboardPage.jsx` |
| API | `GET /api/v1/analyses?limit=50` → `{ items: AnalysisSummary[], nextCursor }` |
| Backend | `analysisService.list()` → `analysisRepository.listOwned()` with projection `{ result: 0, ai: 0, userId: 0, __v: 0 }`: summaries only, newest first, cursor on `_id` |
| Error states | A load failure shows "Your analyses could not be loaded. Please refresh the page to try again." |
| Verification | [T] `analysisApi.test.js` (owner-only, newest first, cursor pagination, page-size bounds); [B] |
| **Limitation** | The client requests `limit: 50` and **ignores `nextCursor`**, so only the 50 most recent analyses are visible, with no "load more" control. The API supports pagination; the UI does not use it. (Recorded as a deliberate limit in the 2026-10-05 report.) |

The title of an analysis comes from `analysisTitle()` in `client/src/lib/format.js`: the JD title and company (joined with " at ") when there is a job, otherwise "Resume check".

## 4. Deleting an analysis

| Aspect | Detail |
|---|---|
| Behaviour | Trash icon → browser `confirm()` dialog naming the analysis and date → on confirm the row disappears and a toast says "Analysis deleted". |
| API | `DELETE /api/v1/analyses/:analysisId` → `204` with an empty body |
| Backend | `analysisService.remove()` → `analysisRepository.deleteOwned()` → `deleteOne({ _id, userId })`. Stored AI results live inside the same document, so they are deleted too. |
| Errors | `404 NOT_FOUND` for a missing, malformed or someone else's id (the analysis is left untouched); `401` without a token |
| Verification | [T] `analysisApi.test.js` (owner-only, deletes only the named analysis), `aiApi.test.js` (AI results deleted with it); [X]; [B] (cancel keeps the row, confirm removes it) |
| Limitations | Permanent, with no undo. No bulk delete. Deleting a user account is not possible through the API. |

---

## 5. Running an analysis

### 5.1 Resume input: upload or paste

| Aspect | Detail |
|---|---|
| UI | `/analyze` → `client/src/pages/AnalysisPage.jsx`. Step 1 is "Add your resume" (Required): a dropzone accepting `.pdf`, `.docx` or `.txt` up to 10 MB, **or** a textarea (100,000 characters maximum). Choosing a file clears pasted text. After a file is chosen it shows as a card with name, type, size and a Remove button. |
| Client-side checks | `react-dropzone` rejects other file types, files over 10 MB and multiple files, with a message. These are convenience checks only; the server re-validates everything. |
| API | `POST /api/v1/analyses` as `multipart/form-data` with file field `resume` **or** text field `resumeText`. JSON `{ resumeText, jobText? }` is also accepted. |
| Backend | `createDocumentUpload()` (multer, in memory) → `validate(CreateAnalysisBodySchema)` → `buildAnalysisInput()` (requires a resume; rejects a document sent both as a file and as text) → `analysisService.create()` → `runAnalysis()` → `ingestFile()` or `ingestPastedText()` |
| File validation | **By content, not by name or MIME type** (`server/src/documents/fileValidation.js`): `%PDF-` header for PDF; ZIP signature plus `word/` or `[Content_Types].xml` for DOCX; no NUL bytes in the first 4 KB for text. Limits: 10 MB per file, TXT up to 1 MB, PDF up to 15 pages, DOCX up to 10 MB of declared unpacked XML (zip-bomb guard), and resume text up to 100,000 characters after extraction. |
| Errors | `400` (no resume, both forms sent, unknown field); `413` (too large); `415` (unsupported content, for example a PNG renamed to `.pdf`); `422 UNPROCESSABLE_DOCUMENT` (encrypted or corrupt PDF, scanned or image-only PDF with no text layer, empty file), with `details.reason` and `details.document: "resume"` |
| Verification | [T] `documents.test.js`, `ingestionRealPath.test.js`, `analysisApi.test.js`; [X] the same fictional resume as paste, TXT, DOCX and two PDFs; [B] PDF and DOCX uploads |
| **Known limitation** | PDF structure reconstruction is weaker than DOCX or text. A long bullet that wraps onto a second line becomes two lines, and bullet markers drawn as graphics are not seen. Resume Health can therefore be several points lower for a PDF than for the same resume as DOCX, while Job Match is unaffected. Full investigation: [RESUME_AND_JD_PARSING.md](RESUME_AND_JD_PARSING.md#9-investigation-why-the-same-resume-scores-differently-as-pdf-and-docx). |

### 5.2 Optional job description

| Aspect | Detail |
|---|---|
| UI | Step 2 "Add a job description" (Optional): a textarea up to 30,000 characters. The side panel highlights "Resume analysis" or "Job match analysis" automatically, depending on whether the textarea has text. The dashboard's "Analyze for a job" opens `/analyze#job` with the field focused. |
| API | `jobText` (pasted) **or** file field `job` (PDF, DOCX or TXT). **The UI only sends pasted text.** Uploading a JD file is an API-only capability, covered by tests ("analyses an uploaded PDF resume against an uploaded DOCX job description"). |
| Behaviour without a JD | `mode: "resume_only"`, `job: null`, `jobMatch: null`; no JD parsing, no Job Match and no job-scoped recommendations. A blank `jobText` counts as "not provided". |
| Errors | JD over 30,000 characters → `413`. An unreadable JD file → `415` or `422` with `details.document: "job"`. |
| Edge case (verified [X]) | A JD pasted as **one single line with no line breaks or headings** produces **zero requirements**. The first line is treated as the job title, and requirement statements are only read from the lines that follow it. The result has `jobMatch.score.score: null` with the reason "The job description has no extractable requirements". |

---

## 6. Results

The results page (`client/src/pages/ResultsPage.jsx`) loads `GET /api/v1/analyses/:id` and shows tabs:

| Tab | Shown for | Component | Content |
|---|---|---|---|
| Overview | always | `ScoreOverview.jsx` | Score rings, verdicts, eligibility alert (job mode), both breakdowns ("where your points came from"), and a call to action |
| Requirements | job mode | `RequirementsTab.jsx` | Every requirement grouped by status, with evidence quotes |
| How to improve | always | `ImprovementTab.jsx` | Eligibility concerns, then recommendations in engine order |
| Resume Health | always | `ResumeHealthTab.jsx` | Readability checks, content findings, the engine's stated limitations |
| Interview prep | job mode | `InterviewPrepTab.jsx` | Optional AI questions |

The open tab is stored in the URL (`?tab=requirements`). If the analysis cannot be loaded (deleted, someone else's, or a bad id) the page shows "This analysis could not be loaded…" with a link back to the dashboard. Resume-only analyses never show Job Match, the Requirements tab or the Interview prep tab, even when `?tab=interview` is typed into the URL (verified [B]).

### 6.1 Resume Health

- **What the user sees:** a 0 to 100 ring with a verdict (≥ 80 "Healthy", ≥ 60 "Fair", otherwise "Needs work"), the reason text when there is no score, a component breakdown (Parseability, Structure, Technical content, Impact, Completeness: points earned out of points available), the readability checks with pass, warning and fail badges and a "What to do" fix, the content findings by severity, and the engine's "Limits of this report".
- **Backend:** `assessResumeHealth()` in `server/src/engine/scoring/resumeHealth.js`. Formula: [SCORING_AND_MATCHING.md](SCORING_AND_MATCHING.md#2-resume-health).
- **Edge case:** fewer than 20 extracted words → `readability: "unreadable"` and a `null` score with a reason (not an error).
- **Verification:** [T] `scoring.test.js`; [X] worked examples (100 for a clean resume, 68.6 for a weak one).

### 6.2 Job Match

- **What the user sees:** a large ring on a dark panel with a verdict (≥ 80 "Strong match", ≥ 60 "Moderate match", otherwise "Weak match"), the component breakdown, and the eligibility alert beneath with the sentence "Eligibility is reported separately and does not change the Job Match score."
- **Backend:** `scoreJobMatch()` in `server/src/engine/scoring/jobMatch.js`. `keywordCoverage` (share of required and preferred skill requirements met or partially met) is computed and returned by the API but **not displayed** in the UI.
- **Verification:** [T] `scoring.test.js`, `analysisPipeline.test.js`; [X] the worked example scores 77.9.

### 6.3 Requirement assessments and evidence snippets

- **What the user sees:** "N requirements found in the job description", a stacked bar, then groups: **Missing, required** · **Partially met** · **Matched** · **Missing, not required** · **Not established or not scored** (`insufficient_evidence` and `not_evaluated`). Each row shows the requirement name, an importance badge (Required, Preferred or Contextual), the engine's reason (the UI replaces "Exact canonical skill match" with "Exact match"), and a "From your resume" quote when evidence exists.
- **Statuses:** `met`, `partially_met`, `missing`, `insufficient_evidence`, `not_evaluated`. Responsibilities and any location data are always `not_evaluated` and are shown as "This item is not scored in this analysis."
- **Evidence:** the quote is the **verbatim original resume line** (including a leading bullet character, if the original had one), at most 300 characters (`Evidence.snippet`).
- **Verification:** [T] `matching.test.js`, `eligibility.test.js`; [X]; [B] six evidence quotes shown in a browser run.

### 6.4 Eligibility and knockouts

- **What the user sees:** on Overview, a green "No eligibility concerns", amber "Eligibility needs review" or red "Likely filtered by a hard requirement" alert with the reasons. On How to improve, an "Eligibility concerns" list (every finding whose outcome is not `passed`). On the dashboard, a badge when the status is not `clear`.
- **Backend:** `evaluateEligibility()` and `deriveEligibilityStatus()`. Policy and rules: [SCORING_AND_MATCHING.md](SCORING_AND_MATCHING.md#6-eligibility-and-knockouts).
- **Verification:** [T] `eligibility.test.js`, `scoring.test.js`, `analysisPipeline.test.js`; [X].
- **Known defect (verified [X]):** a JD line that *offers* sponsorship ("We offer visa sponsorship") is parsed as a hard work-authorisation requirement. If the resume says the candidate will require sponsorship, the result becomes `likely_filtered` with a critical recommendation, which is wrong. Details: [KNOWN_LIMITATIONS_AND_ROADMAP.md](KNOWN_LIMITATIONS_AND_ROADMAP.md).

### 6.5 Recommendations ("How to improve")

- **What the user sees:** cards in the engine's order, each with a priority badge (Critical, High, Medium, Low), a category badge, the issue, a "What to do" box, "Why this matters", and the integrity note in amber when there is one.
- **Backend:** `buildRecommendations()`; resume-scope rules in `resumeRules.js`, job-scope rules in `jobRules.js`. No AI is involved.
- **Verification:** [T] `recommendations.test.js` (29 tests including grounding, integrity notes, ordering and determinism); [X].

---

## 7. AI features

### 7.1 Interview preparation (the only AI feature in the UI)

| Aspect | Detail |
|---|---|
| Purpose | Revision topics and likely interview questions for *this* job, each tied to a requirement or a resume evidence item. |
| UI | The Interview prep tab (job mode only). The start state has "Generate questions", which is disabled when AI is unavailable, and shows the message "AI assistance is not available right now. Your analysis is unaffected." The generated state shows topics, numbered questions with "Based on: <requirement name>" or "Your resume", and a "Regenerate" button. |
| API | `POST /api/v1/analyses/:id/ai` with `{ task: "interview_prep", regenerate }` → always `200 { ai: AiTaskResult }` |
| Backend | `groundedAiService.runTask()` → `TASKS.interview_prep` (`server/src/application/ai/tasks.js`) |
| Persistence | Only a `completed` result is stored, at `analysis.ai.interview_prep`; later visits show it without a new model call. |
| Errors | A non-`completed` status shows a toast (unavailable, or "No interview material could be produced…"); the page itself stays unchanged. |
| Verification | [T] `groundedAi.test.js`, `aiApi.test.js` (scripted providers); [X] in-memory run with a scripted provider; [B] **one real Gemini run on 2026-10-05** succeeded on its second attempt after a provider 503 (8 topics, 9 questions, every cited id valid), using a model name supplied to the test server only. The later visual-redesign QA could not exercise real AI (provider rate-limited). |
| Requires | `AI_PROVIDER`, the provider API key **and** `AI_MODEL`. The local `server/.env` has no `AI_MODEL`, so this feature is **off** locally until one is set. |

### 7.2 AI tasks available only through the API

`resume_explanation`, `job_match_explanation`, `recommendation_wording` and `bullet_suggestions` are implemented, validated and tested in the backend, but **no UI calls them**. They are backend capabilities, not user-facing features. Details: [AI_INTEGRATION.md](AI_INTEGRATION.md#4-supported-tasks).

### 7.3 AI availability and failure handling

Every analysis view carries `ai: { status: "available" | "unavailable", provider, model, results }`. Task outcomes are `completed`, `failed` (the answer was rejected), `unavailable` (not configured or the provider is unreachable) or `not_applicable` (for example, interview prep on a resume-only analysis). An AI failure is never an HTTP error and never changes the analysis. Verified [T][X]: the `result` object is byte-identical before and after an AI task.

---

## 8. Persistence and historical results

- An analysis is stored once, at creation, as a single MongoDB document. Reopening it (from the dashboard or by URL) returns the stored `result` exactly as created. It is **not** re-computed, so an old analysis keeps the engine versions it was produced with (`versions` and `result.engine`).
- What is stored and what is not: [DATABASE_AND_DATA_MODEL.md](DATABASE_AND_DATA_MODEL.md).
- Verification: [T] "returns the stored analysis to its owner, identical to what was created and still contract-valid".

## 9. Operational endpoints

`GET /api/health` (plain `{ status: "OK", … }`, not the standard envelope), `GET /api/health/live` → `{ status: "live" }`, and `GET /api/health/ready` → `{ status: "ready", checks: { database: "up" } }` or `503 NOT_READY`. These are used by the Docker `HEALTHCHECK` (`/live`). Verified [T][X].

---

## 10. Removed features

These existed in the legacy V1/V2 application and were **deleted** in Phase 11 (2026-10-04). They are not hidden or disabled; the code no longer exists.

| Feature | Evidence that it is gone |
|---|---|
| PDF report export (`/api/export/:id`) | `server/routes/export.js` deleted. `ownership.test.js` asserts `GET /api/export/…` returns `404 NOT_FOUND`. No export control in the UI. |
| AI bullet optimizer and saved resume versions (`/api/resumes/:id/optimize`, `/versions`) | `server/routes/resumes.js` and `server/models/Resume.js` deleted; the legacy `SuggestionsTab` is gone. The new `bullet_suggestions` AI task only *suggests* wording and never edits or stores a resume. |
| Learning roadmap | `client/src/components/results/LearningRoadmapTab.jsx`, `server/models/LearningRoadmap.js` and `server/routes/career.js` deleted. `POST /api/career/:id/interview-prep` returns 404 (test). |
| Project relevance | `ProjectAnalysisTab.jsx` and `server/models/ProjectRelevance.js` deleted. The contract field `result.jobMatch.projectRelevance` still exists but is **always `[]`** (`runAnalysis.js`). |
| Multi-JD "job sets" | `server/models/JobAnalysisSet.js` deleted; `GET /api/career/job-sets` returns 404 (test). |
| Google sign-in | Legacy `/api/auth/google` routes deleted (404 in test); no Google button in the UI. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` remain in the local `server/.env` but **nothing reads them**. |
| Bias dashboard | `client/src/pages/BiasDashboard.jsx` deleted (it was never routed). |
| V1 overall score, V2 "parse score" and the shadow and `ATS_V2_MODE` switch | Replaced by Resume Health and Job Match. `ATS_V2_MODE` remains in the local `.env` but is unused. |
| Semantic and embedding matching (Transformers.js) | `server/services/matching/SemanticMatcherV2.js` and `server/services/ai/EmbeddingService.js` deleted; `@xenova/transformers` is no longer installed. |

How this was checked: `git status` lists the deleted files; a search of `client/src` and `server/src` finds no references to export, roadmap, job sets, Google OAuth or Groq; and `ownership.test.js` verifies the old routes return `404` and that only `/api/health` and `/api/v1` are mounted.
