# Recommendation engine (Phase 7)

Answers "what should the user do next?" from the analysis that already exists.
It does no parsing, matching or scoring of its own.

```
ResumeHealthReport ──────────────────────────────┐
requirements + assessments + eligibility + score ─┼─► buildRecommendations(...) ─► Recommendation[]
Evidence[] (for reference validation) ────────────┘
```

`buildRecommendations({ resumeHealth, jobMatch = null, evidence = [] })` returns
`{ recommendationsVersion, recommendations }`. Pure and deterministic: no DB,
network, clock or LLM, and no API key is needed. Output uses the Phase 1
`Recommendation` contract unchanged.

- `resumeRules.js` — resume-scope rules, keyed by Resume Health check / rule ids.
- `jobRules.js` — job-scope rules, chosen from a requirement's assessment and knockout finding.
- `recommend.js` — joins sources, assigns priority and impact, orders, validates grounding.

## Categories

| Contract category | Source |
|---|---|
| `parseability` | Resume Health parseability checks (text, characters, layout, headings, length, embedded instructions) |
| `format` | structure findings (undated roles, missing title/organisation, entries without content) |
| `technical_content` | skills not named, or listed but not shown in use |
| `content_quality` | impact findings (few measurable results, few action verbs) |
| `completeness` | contact details, work evidence, education, skills section |
| `skills`, `experience`, `education`, `certifications` | job requirement gaps (job scope only) |
| `eligibility` | clearance, work authorization, language (job scope only) |

## Grounding and traceability

A recommendation exists only if a deterministic source exists:

- **Resume scope** — a Resume Health deduction. `findingIds` holds the `chk_…` /
  `fnd_…` ids, and the issue text is the finding's own message (with its counts).
- **Job scope** — a requirement whose assessment is not fully satisfied.
  `requirementIds` holds the requirement, `evidenceIds` the evidence the assessment
  cites, and `findingIds` the `ko_…` knockout finding when there is one.

`assertGrounded` runs on every result and throws if a recommendation has no
source or cites a requirement, evidence or finding id that does not exist.

`expectedImpact.scoreDelta` is the points the Phase 6 deduction reports for that
subject. It is `null` where scoring exposes no number (eligibility, unreadable resume).

## Priority

| Priority | When |
|---|---|
| `critical` | explicit critical eligibility knockout |
| `high` | required skill or certification missing; required experience, education or hard eligibility requirement not evidenced; a major Resume Health issue (≥ 6 points, or a failed contact / work-evidence / text / embedded-instruction check) |
| `medium` | required requirement only partially or weakly evidenced; Resume Health issue worth ≥ 2.5 points |
| `low` | any preferred or contextual requirement gap; minor Resume Health issues |

Order: priority, then a fixed rule rank (knockout → required missing → required
not evidenced → major health → partial → preferred → presentation → minor), then
points at stake, then id. Preferred requirements are never above `low`.

## Deduplication

- One requirement produces at most one recommendation (duplicates are skipped by canonical key).
- Related Resume Health findings share one rule: email + phone + name → one
  contact recommendation; encoding + icon glyphs → one; undated roles + missing
  title/organisation → one; skills not demonstrated + entries without skills → one.

## Resume-only vs job-specific

Without `jobMatch`, only resume-scope recommendations are produced. They never
mention an employer, a job or a specific technology the resume lacks. With
`jobMatch`, job-scope recommendations are added for unmet requirements; fully met
requirements produce nothing.

## Truthful-edit rules

| Situation | Recommendation |
|---|---|
| Evidence exists but is weak (skill only listed) | improve presentation: show it in the role or project where it was used |
| Related evidence only (PostgreSQL for SQL) | clarify: name the skill explicitly *if* there is direct experience |
| No evidence | explain the gap; add it only if it is true, otherwise leave it out and consider learning it |
| Eligibility knockout | verify eligibility; rewording cannot resolve it |
| Eligibility unknown | not a failure; verify, and state it only if held |

No action tells the user to add a skill, credential, date or figure outright.
`integrityNote` is set on every action that suggests adding content. Impact advice
asks for verifiable results and never supplies a number.

## AI boundary

No LLM is used. A later phase may rephrase `issue` / `action` text, but only
from the fields of an existing recommendation; it must not create, remove,
re-prioritise or add facts to one.

## Examples

```
high  REC-SKILL-MISSING        Kubernetes is a required skill in the job description, but no
                               supporting evidence was found in the resume.
                               → If you have genuine Kubernetes experience, state it explicitly…
                                 If you do not, leave it out…
medium REC-SKILL-RELATED-ONLY  The job description lists SQL as required. The resume shows
                               PostgreSQL, which is related and gives partial coverage…
low   REC-SKILL-OPTIONAL-MISSING  AWS is a preferred skill in the job description…
```

## Limitations

- Wording is rule-based, so phrasing is uniform across similar gaps.
- Responsibilities and location produce no recommendations (not evaluated yet).
- Resume recommendations do not cite `Evidence` ids; they cite the check or finding.
