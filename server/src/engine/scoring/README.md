# Scoring engine (Phase 6) — Resume Health & Job Match

Two separate, deterministic scores. Both are **ATS-analysis metrics, not hiring
probabilities or guarantees**. Pure functions: no DB, network, clock, LLM,
embeddings or randomness. All weights live in `model.js`.

| Score | Function | Answers | Needs a job? |
|---|---|---|---|
| Resume Health | `assessResumeHealth({ normalizedDocument, resumeProfile })` → `ResumeHealthReport` | How complete, structured, readable and well-evidenced is this resume? | No |
| Job Match | `scoreJobMatch({ jobProfile, assessments, eligibility })` → `{ score, keywordCoverage, gate, summary }` | How strongly does the resume evidence match this job's explicit requirements? | Yes — never computed from a resume alone |

A well-prepared resume can have high health and a low match for a given job, and
the reverse. The two are never blended.

## Shared arithmetic (`breakdown.js`)

Both scores are `ScoreBreakdown` contracts built the same way:

- A component is **evaluated** only if it has items. Otherwise it carries no weight
  and is excluded; it is never awarded free points.
- `effectiveWeight` = component weight ÷ Σ weights of evaluated components.
- `rawScore` = Σ(itemWeight × credit) ÷ Σ itemWeight.
- `contribution` = effectiveWeight × rawScore × 100, and `score` = Σ contributions.
- Every lost point is a `deduction` with a cause and message, so
  `score + Σ deductions = 100`.
- **Bounds:** 0–100. **Rounding:** arithmetic is unrounded; the score is rounded
  half-up to one decimal, contributions to two, per-item points to three.
- `score` is `null` (with `scoreReason`) when nothing could be evaluated. No
  division by zero, no `NaN`.

## Job Match Score

Requirement-driven. Each scored requirement is exactly **one item in one
component**, so one piece of evidence is never counted twice. A requirement's
weight is `TYPE_WEIGHT × IMPORTANCE_WEIGHT`; a component's weight is the sum of
its items' weights (so `baseWeight` equals `effectiveWeight`).

| Requirement type | Component | Type weight |
|---|---|---|
| skill, skill_group (required) | `required_skills` | 1 |
| skill, skill_group (preferred / contextual) | `preferred_skills` | 1 |
| experience_years | `experience` | 2 |
| education | `education` | 1.5 |
| certification | `certifications` | 1 |
| responsibility | `responsibilities` | 1 (not evaluated yet → excluded) |
| language, work_authorization, clearance, location | — (eligibility only) | not scored |

| Importance | Weight |
|---|---|
| required | 1 |
| preferred | 0.3 |
| contextual | 0.15 |

With ten required skills and one preferred skill, the preferred skill is worth
about 3 points and each required skill about 10.

### Credit per status

| Status | Credit | Deduction cause |
|---|---|---|
| `met` | assessment credit × evidence strength (skills: strong 1, moderate 0.9, weak 0.8) | `weak_evidence` when strength < 1 |
| `partially_met` | assessment credit × evidence strength (e.g. PostgreSQL→SQL = 0.9) | `implied_only` or `partial` |
| `missing` | 0 | `missing` |
| `insufficient_evidence` | experience: demonstrated ÷ required months; anything else: 0.25 | `insufficient_evidence` |
| `not_evaluated` | excluded from the denominator | — |

`insufficient_evidence` is not silently treated as `missing`. Experience is the
one measured case: explicit dates establish a share of the required duration, and
that share is the credit (zero dated months earns zero). Other types get a fixed
neutral credit that sits above `missing` and below every partial match.

### Eligibility and knockouts

Clearance, work authorization, language and location are reported through
`Eligibility`, not through the score. The score stays an honest measure of
evidence against requirements, and the returned `gate` states the eligibility
verdict beside it:

- `likely_filtered` (an explicit **critical** knockout) → `gate.hardKnockout: true`
  with the requirement ids and a plain message, repeated in `score.confidence.reasons`.
  **The number is not changed or capped.**
- `review` (e.g. a required clearance the resume is silent about) → not a failure,
  no points lost.
- An ordinary missing skill only loses its own weight; it can never act as a knockout.

`keywordCoverage` is the share of required / preferred skill requirements that
are met or partially met (`null` when there are none).

## Resume Health Score

Built only from the `ResumeProfile` and the document's own diagnostics.

| Component | Weight | What is checked |
|---|---|---|
| `parseability` | 0.25 | text extracted, encoding, icon glyphs, reading order, standard headings, length, embedded instructions |
| `structure` | 0.20 | roles dated, roles have title + organisation, entries describe the work |
| `technical_content` | 0.25 | distinct recognised skills, skills demonstrated in roles/projects, entries mention skills |
| `impact` | 0.15 | bullets with a measurable result (full credit at 30%), bullets opening with an action verb (full credit at 60%) |
| `completeness` | 0.15 | email, phone, name, work evidence, education, skills |

Checks grade `pass` 1 / `warn` 0.5 / `fail` 0; graded rules earn proportional
credit and produce a `finding` when credit is lost.

Not penalised: a missing summary, certifications, projects, links or a phone
number being absent beyond a mild warning. Projects count as practical evidence
when there is no work experience (0.7). Metrics are never required of every bullet.
A component with nothing to inspect (e.g. `impact` with no bullets) is excluded.

A resume with fewer than 20 extracted words is `unreadable` and gets no numeric
score. Otherwise `readability` follows the parseability raw score (≥0.85 good,
≥0.6 fair, else poor).

## Known limitations

- A hard knockout does not cap the number, because `ScoreBreakdown` requires the
  score to equal the sum of its contributions and has no eligibility component.
- Responsibilities are not scored until they are evaluated in a later phase.
- Technical-content checks rely on the built-in taxonomy (software/data roles).
- Experience credit uses point estimates of dated months; year-only dates are not widened.
- Weights are design choices, documented here; they were not fitted to outcome data.
