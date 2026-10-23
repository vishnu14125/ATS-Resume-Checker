# Grounded AI layer (Phase 9)

AI is an optional edge service that explains and rewords the result of the
deterministic analysis. It runs strictly after the analysis, only reads it, and
is never required: without a provider every analysis feature still works.

```
deterministic engine (Phases 2–7) ─► AnalysisResult ─► stored
                                           │  read only
                                           ▼
                 buildContext ─► system prompt + <task_input> JSON ─► provider
                                                                         │
           stored AiTaskResult ◄─ ground ◄─ schema validation ◄─ JSON ◄──┘
```

## Responsibilities

| Deterministic engine decides | AI may do |
|---|---|
| scores, requirement status, evidence, eligibility, knockouts | explain the Resume Health and Job Match results |
| which recommendations exist, their priority, category and references | reword an existing recommendation |
| experience, education, certification and skill findings | suggest interview questions tied to a requirement or evidence item |
| | suggest clearer wording for an existing bullet |

AI output is stored beside the `AnalysisResult` (`analysis.ai`), never inside it,
and nothing the model returns is read by the engine. `runAnalysis` has no AI
dependency; creating or reading an analysis never calls a model.

## Files

| File | Role |
|---|---|
| `aiProvider.js` | Provider port and `AiProviderError` |
| `infrastructure/ai/geminiProvider.js`, `openaiProvider.js` | Adapters: request format, timeout, error mapping |
| `infrastructure/ai/createAiProvider.js` | Provider selection and bounded retry |
| `prompts.js` | Static system instructions (versioned) |
| `grounding.js` | Redaction, injection withholding, unsupported-claim checks |
| `tasks.js` | Per task: context builder, model schema, grounding |
| `groundedAiService.js` | Runs a task and stores the validated result |
| `domain/contracts/ai.js` | `AiTaskResult`, `AiEnrichment` and task output schemas |

## Tasks

One request to `POST /api/v1/analyses/:analysisId/ai` with `{ "task": "…", "regenerate": false }`
runs one task with at most one model call (plus the bounded retry).

| Task | Needs | Output |
|---|---|---|
| `resume_explanation` | any analysis | summary, strengths, improvements (with why) |
| `job_match_explanation` | a job description | summary and lists for matched / partial / missing / insufficient evidence / eligibility |
| `recommendation_wording` | at least one recommendation | clearer explanation, action and rationale per existing recommendation id |
| `interview_prep` | a job description | topics and questions, each with a requirement or evidence basis |
| `bullet_suggestions` | cited bullets with no measurable result | a restatement per bullet, with the original |

The response is always `200 { ai: AiTaskResult }`:

| `status` | Meaning | `reason` examples |
|---|---|---|
| `completed` | validated, grounded output; stored | — |
| `not_applicable` | the analysis has no grounded data for the task; no model call | `requires_job_description`, `no_grounded_data` |
| `unavailable` | AI is not configured or the provider could not be reached | `not_configured`, `provider_timeout`, `provider_rate_limited`, `provider_unavailable`, `provider_auth_failed` |
| `failed` | the model answered but the answer was rejected | `invalid_output`, `ungrounded_output`, `input_too_large` |

Only `completed` results are stored. A stored result is returned without a model
call unless `regenerate` is true. `GET /analyses/:id` returns
`ai: { status, provider, model, results }`; with no provider this is
`{ "status": "unavailable", "provider": null, "model": null, "results": [] }`.

## Grounding

1. **Minimum context.** Each task gets a small JSON object built from the stored
   result: scores, requirement names and statuses, engine explanations, and the
   evidence snippets the analysis already cites. The document itself is never sent.
2. **Typed references.** Every output item cites ids that were supplied, and only
   ids of the right kind: a "matched" item may cite only requirements whose status
   is `met`; a recommendation rewording must name an existing recommendation id;
   an interview question's basis must be a supplied requirement or evidence id.
   An item with an unknown or wrong-kind id is dropped.
3. **Unsupported claims.** Output text is checked against the vocabulary of the
   supplied facts. A number, technology (taxonomy), certification or capitalised
   name that the facts do not contain is an unsupported claim. For bullet
   suggestions the vocabulary is the original bullet alone, and outcome or
   seniority words it does not contain ("led", "improved", "reduced") are rejected.
4. **Conditions are kept.** A recommendation whose action is conditional ("if you
   have genuine experience…") is dropped if the rewording is no longer conditional.
5. An unsupported summary rejects the whole answer; unsupported items are removed
   and counted in `droppedItems`; if nothing sound remains the task fails.

These checks are deterministic and fail closed. They cannot verify meaning, so a
fluent but subtly wrong sentence that uses only supplied words and ids can pass.

## Prompt injection

Resume and job text is untrusted data.

- The system prompt is static. No document text is ever interpolated into it.
- Task input is JSON inside `<task_input>` in the user message; angle brackets in
  the data are escaped so it cannot close the tag.
- Text that addresses an automated system ("ignore previous instructions…",
  "System: …") is withheld and replaced by a marker before anything is sent.
- If a model follows an injection anyway, the output checks above still apply, and
  the output cannot reach scores, statuses, eligibility or recommendations.

## Data sent to the provider

Sent: Resume Health and Job Match scores, check and finding messages, requirement
names/types/statuses, engine explanations, recommendation text, and the cited
evidence snippets (single resume lines, at most 300 characters each).

Not sent: the full resume or job description, names of files, user or analysis
ids, content hashes, timestamps, engine versions, tokens or keys. Email addresses,
phone numbers and links inside any sent text are replaced by `[email]`, `[phone]`
and `[link]`.

Whatever is sent is subject to the provider's own data-handling terms; this
application makes no claim about provider-side retention.

## Stored

`analysis.ai.<task>` holds the validated `AiTaskResult`: task, status, provider,
model, prompt version, time, grounded output and dropped-item count. Prompts and
raw model responses are not stored. Deleting an analysis deletes its AI results.

## Configuration

| Variable | Purpose |
|---|---|
| `AI_PROVIDER` | `gemini`, `openai` or `none` |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | key for the selected provider (backend only) |
| `AI_MODEL` | model id; falls back to `GEMINI_MODEL` / `OPENAI_MODEL`. No built-in default |
| `AI_TIMEOUT_MS` (20000), `AI_MAX_OUTPUT_TOKENS` (4096), `AI_MAX_RETRIES` (1, max 2) | limits |
| `AI_RATE_LIMIT_WINDOW_MS`, `AI_RATE_LIMIT_MAX` (30 per 15 min) | limiter on the AI endpoint |

AI is enabled only when the provider, its key and a model are all set. Anything
missing disables AI with a startup warning; the server still starts.

Retries apply to rate limits, 5xx, network failures and empty responses only.
Timeouts, auth errors and rejected requests are not retried. Input is capped at
24,000 characters per task.

## Testing

`npm test` needs no API key and makes no network calls: providers are replaced by
scripted fakes (`aiProvider.test.js`, `groundedAi.test.js`, `aiApi.test.js`).

Manual check against the real provider (opt-in, sends a built-in sample only):

```
node scripts/aiProviderSmoke.js            # all tasks
node scripts/aiProviderSmoke.js interview_prep
```

## Limitations

- The claim checks have not been tuned against real model output; they may drop
  sound items (for example an unfamiliar capitalised word). They fail closed.
- Bullet suggestions cover only bullets the analysis cites as evidence, so they
  need a job description. Resume-only analyses store no bullet text.
- Concurrent requests for the same task can each call the model.
