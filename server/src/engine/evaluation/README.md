# Evaluation engine (Phase 5) — evidence, eligibility & knockouts

Deterministic, explainable grounding of a resume against a job's requirements.
Pure functions only: **no DB, network, clock or LLM**, and the reference date is
injected. Consumes the Phase 1 contracts, the Phase 2 `ResumeProfile`, the Phase 3
`JobProfile`, and the Phase 4 `RequirementAssessment[]`.

```
ResumeProfile + JobProfile + Phase-4 assessments + NormalizedDocument
        │
        ▼  evaluateEligibility(...)
  Evidence engine ─► enriched RequirementAssessment[] ─► Knockout findings ─► Eligibility
```

## Core principle

> **Absence of evidence is not evidence of failure.**

Matching asks *"does the resume appear to contain the required skill/concept?"*.
Evidence asks *"what exact resume text supports that?"*. Eligibility asks *"does the
candidate satisfy explicit hard constraints?"*. Knockout asks *"is there an explicit
hard requirement the evidence shows is **not** satisfied?"*. These stay separate; a
missing skill is **never** auto-converted into a knockout.

## Evidence

Every `Evidence` points at real `NormalizedDocument` lines and quotes them verbatim
(`snippet`, ≤300 chars). Nothing is invented. Ids are deterministic and reuse the
matcher's `evidenceIdFor`, so evidence lines up with the ids match results already
reference — referential integrity holds by construction. A taxonomy relationship
(e.g. PostgreSQL → SQL) may support a *match*, but the evidence still points at what
the resume literally says ("PostgreSQL"), never at the inferred concept ("SQL").

## Requirement status (per the `RequirementAssessment` contract)

| Status | Meaning |
|---|---|
| `met` | Requirement satisfied with supporting evidence. |
| `partially_met` | Related/partial support (e.g. PostgreSQL→SQL; degree below level or wrong field). |
| `missing` | The resume lacks the required content (skills, certifications, an explicitly denied credential). |
| `insufficient_evidence` | The resume cannot safely establish satisfaction **or** failure — a neutral "cannot tell", not a failure. |
| `not_evaluated` | Out of scope for this phase (e.g. `responsibility`). |

## Deterministic inference boundaries

- **Experience** is established **only** from explicit employment date ranges.
  Overlapping roles are **merged, not summed**. Never inferred from the number of
  jobs/projects, skill-mention counts, or graduation dates. Can't establish the
  required duration → `insufficient_evidence`.
- **Education** inspects parsed degree records only. Never inferred from job titles,
  projects, skills or institution names. No degree info → `insufficient_evidence`.
  A different field (related not accepted) → `partially_met`, not an equivalence.
- **Certification** must be explicitly listed → otherwise `missing`. Never inferred
  from a related skill, tool or project.
- **Language** uses explicitly listed languages. Spoken proficiency is never inferred
  from the language the resume is written in.
- **Work authorization & clearance** have no structured field and are read **only**
  from explicit candidate statements in the document. Never inferred from name,
  location, email, employer or citizenship-adjacent hints.

## Eligibility & knockouts

`Eligibility.status` is derived from the knockout findings by the contract's single
rule (`deriveEligibilityStatus`):

- `likely_filtered` — a **critical** finding is `failed` with confidence ≥ 0.6
  (an explicit hard disqualification, e.g. the resume states it lacks a required
  clearance).
- `review` — any `at_risk`/`failed` finding, or a **critical** `unknown` (e.g. a
  required clearance the resume is silent about — flagged for a human, not filtered).
- `clear` — otherwise.

Severity & outcome policy:

| Requirement (hard constraint) | Severity | Satisfied | Shortfall / silence |
|---|---|---|---|
| Clearance, work authorization | `critical` | `passed` | explicit denial → `failed`; silence → `unknown` |
| Experience years, degree, certification, language | `high` | `passed` | `unknown` (degree with a real gap → `at_risk`) |

Only `required` hard constraints are knockout candidates; `preferred`/`contextual`
requirements never produce findings. A `high`-severity `unknown` never filters a
candidate, so a missing degree/cert/experience is surfaced in the assessment (and
later scoring), not as an eligibility block.

## Privacy

The engine performs no logging. Resume text appears only inside grounded `Evidence`
snippets (≤300 chars, used to explain a decision) — never emails, phones, addresses
or authorization documents in logs.
