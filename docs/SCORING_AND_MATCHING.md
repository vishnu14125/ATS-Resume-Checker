# Scoring and Matching

> The exact rules the engine uses, as implemented, with formulas, weights, worked numbers and edge cases. Every number below is taken from `server/src/engine/scoring/model.js`, the scoring and matching modules, or a real run of the engine (2026-10-19 and 2026-10-20). Where an existing README describes behaviour slightly differently from the code, section 8 records the discrepancy.

**Files:** `server/src/engine/scoring/` (`model.js`, `breakdown.js`, `resumeHealth.js`, `jobMatch.js`), `server/src/engine/matching/`, `server/src/engine/taxonomy/`, `server/src/engine/evaluation/`, `server/src/engine/recommendations/`.

---

## 1. Shared arithmetic: the `ScoreBreakdown`

Both scores are built by `buildBreakdown()` (`server/src/engine/scoring/breakdown.js`) and validated as a `ScoreBreakdown` contract (`server/src/domain/contracts/score.js`).

A score has **components**; each component has **items**; each item has a weight $w$ and a credit $c \in [0, 1]$.

```math
\text{rawScore}_k = \frac{\sum_{i \in k} w_i \, c_i}{\sum_{i \in k} w_i}
\qquad
\text{effectiveWeight}_k = \frac{W_k}{\sum_{j \in E} W_j}
```

```math
\text{contribution}_k = 100 \cdot \text{effectiveWeight}_k \cdot \text{rawScore}_k
\qquad
\text{score} = \sum_{k \in E} \text{contribution}_k
```

where $E$ is the set of **evaluated** components (those with at least one item and positive weight), and $W_k$ is the component weight.

Each item's lost points are:

```math
\text{pointsLost}_i = 100 \cdot \text{effectiveWeight}_k \cdot \frac{w_i}{\sum_{j \in k} w_j} \cdot (1 - c_i)
```

**Invariants**, enforced by the contract (with a tolerance of 0.15 for rounding):

1. Only evaluated components carry weight, and their effective weights sum to 1.
2. A component with nothing to evaluate is `not_evaluated` or `not_applicable`, carries **no** weight and is never given free points.
3. `score = Σ contributions`, and `score + Σ deductions.pointsLost = 100`.
4. `score` is `null` only when nothing could be evaluated, and then `scoreReason` explains why.
5. Deductions are sorted by `pointsLost`, largest first.

**Rounding:** all arithmetic is unrounded; then the score is rounded **half-up to 1 decimal**, contributions and maximum contributions to 2, item points to 3, raw scores to 4, and effective weights to 6 (`round()` in `model.js` adds `Number.EPSILON` before rounding). The UI displays whole numbers (`Math.round`) in score rings.

**Why this design?** Every point is accounted for. "Why 77.9?" is answered by the list of deductions, each naming a requirement or check and a cause.

---

## 2. Resume Health

**Function:** `assessResumeHealth({ normalizedDocument, resumeProfile })` → `ResumeHealthReport`. It is job-independent and pure.

### 2.1 Components

| Component | Base weight $W_k$ | Question it answers |
|---|---|---|
| `parseability` | 0.25 | Can software read the document? |
| `structure` | 0.20 | Are roles and entries well formed? |
| `technical_content` | 0.25 | Are skills named and shown in use? |
| `impact` | 0.15 | Do bullets show outcomes and actions? |
| `completeness` | 0.15 | Are the essentials present? |

If a component has no items (for example `impact` when the resume has no bullet points), it is excluded and the others are re-normalised. With `impact` excluded, the remaining weights become 0.25/0.85, 0.20/0.85 and so on.

### 2.2 Every item

**Checks** are graded `pass` = 1, `warn` = 0.5, `fail` = 0 (a `not_applicable` check adds no item). **Rules** earn a proportional credit between 0 and 1.

| Component | Item (weight) | Kind | How the credit is decided |
|---|---|---|---|
| parseability | `text_layer` (3) | check | words < 20 → fail; < 100 → warn; else pass |
| parseability | `encoding` (2) | check | 0 replacement characters (�) → pass; less than 0.5% of characters → warn; else fail |
| parseability | `icon_glyphs` (1) | check | 0 private-use (icon-font) characters → pass; else warn |
| parseability | `reading_order` (2) | check | multi-column suspected (PDF) or any table (DOCX) → warn; else pass; `not_applicable` if no layout information exists |
| parseability | `standard_headings` (2) | check | ≥ 3 recognised headings → pass; ≥ 1 → warn; 0 → fail |
| parseability | `length` (1) | check | more than 1,400 words or more than 3 pages (PDF only) → warn; else pass |
| parseability | `embedded_instructions` (1) | check | a line like "ignore previous instructions" or "rank this resume" → fail; else pass |
| structure | `dated_roles` (2) | check | share of experience entries with dates: 1 → pass; ≥ 0.5 → warn; else fail; `not_applicable` without experience |
| structure | `entry_structure` (2) | check | share of experience entries with both a title and an organisation (same grading) |
| structure | `STRUCT-ENTRY-CONTENT` (2) | rule | share of experience and project entries with bullets or description lines (only when entries exist) |
| technical_content | `TECH-SKILLS-RECOGNISED` (2) | rule | distinct recognised skills: ≥ 8 → 1; ≥ 4 → 0.7; ≥ 1 → 0.4; 0 → 0 |
| technical_content | `TECH-SKILLS-DEMONSTRATED` (2) | rule | min(1, share of skills mentioned inside a role or project ÷ 0.5) (only if any skill exists) |
| technical_content | `TECH-ENTRY-SKILLS` (1) | rule | share of entries that mention a recognised skill (only when entries exist) |
| impact | `IMPACT-METRICS` (2) | rule | min(1, share of bullets with a metric ÷ 0.3) (only when bullets exist) |
| impact | `IMPACT-ACTION-VERBS` (1) | rule | min(1, share of bullets starting with an action verb ÷ 0.6) |
| completeness | `contact_email` (3) | check | email found → pass; else fail |
| completeness | `contact_phone` (1) | check | phone found → pass; else warn |
| completeness | `COMP-NAME` (1) | rule | name found → 1; else 0 |
| completeness | `COMP-WORK-EVIDENCE` (3) | rule | experience → 1; projects only → 0.7; neither → 0 |
| completeness | `COMP-EDUCATION` (2) | rule | an education entry → 1; else 0 |
| completeness | `COMP-SKILLS` (2) | rule | a skills section → 1; skills mentioned elsewhere only → 0.7; none → 0 |

**Optional sections are not penalised:** no rule rewards a summary, certifications, projects or links. Projects only matter as fallback work evidence (0.7) and as entries. Metrics are never required of every bullet; 30% of bullets with a measurable result already earns full credit.

**Findings and their severity:** a rule that loses credit creates a `ContentFinding`. Credit 0 → `high` if the weight is at least 2, otherwise `medium`; credit below 0.5 → `medium`; otherwise `low`.

### 2.3 Readability label and the "unreadable" case

| Condition | `readability` | Score |
|---|---|---|
| fewer than 20 words | `unreadable` | `null`, with `scoreReason` "Only N words of text could be extracted…" |
| parseability raw score ≥ 0.85 | `good` | numeric |
| ≥ 0.60 | `fair` | numeric |
| otherwise | `poor` | numeric |

Confidence label: `low` if unreadable; `medium` if fewer than 100 words or a multi-column layout is suspected; otherwise `high`. The label is returned by the API but **not shown in the UI**.

### 2.4 Limitations stated by the engine itself

Every report includes three sentences (`LIMITATIONS` in `resumeHealth.js`): the score is a deterministic resume-quality metric, not a hiring probability; visual design is not assessed; and skills are recognised from a software- and data-focused taxonomy. The UI shows them as "Limits of this report".

### 2.5 Worked example

A deliberately weak, fictional resume (run on 2026-10-19):

```text
Rahul Sample
rahul.sample@example.com

Experience
Web Developer, Lotus Web Studio
- Responsible for website maintenance.
- Worked on the company landing page using HTML and CSS.

Education
Diploma in Computer Engineering, Example Polytechnic, 2021

Skills
HTML, CSS, JavaScript
```

| Component | Items as (weight, credit) | rawScore | Effective weight | Contribution |
|---|---|---|---|---|
| parseability | text_layer (3, **0.5**, 35 words), encoding (2, 1), icon_glyphs (1, 1), reading_order (2, 1), standard_headings (2, 1), length (1, 1), embedded_instructions (1, 1) | 10.5 ÷ 12 = 0.875 | 0.25 | 21.88 |
| structure | dated_roles (2, **0**), entry_structure (2, 1), STRUCT-ENTRY-CONTENT (2, 1) | 4 ÷ 6 = 0.6667 | 0.20 | 13.33 |
| technical_content | TECH-SKILLS-RECOGNISED (2, **0.4**, 3 skills), TECH-SKILLS-DEMONSTRATED (2, 1), TECH-ENTRY-SKILLS (1, 1) | 3.8 ÷ 5 = 0.76 | 0.25 | 19.00 |
| impact | IMPACT-METRICS (2, **0**), IMPACT-ACTION-VERBS (1, **0**) | 0 | 0.15 | 0.00 |
| completeness | contact_email (3, 1), contact_phone (1, **0.5**), COMP-NAME (1, 1), COMP-WORK-EVIDENCE (3, 1), COMP-EDUCATION (2, 1), COMP-SKILLS (2, 1) | 11.5 ÷ 12 = 0.9583 | 0.15 | 14.37 |
| **Resume Health** | | | | **68.6** |

Deductions, which add up to 31.4: no metrics 10.0, undated role 6.667, few recognised skills 6.0, no action verbs 5.0, thin text 3.125, no phone 0.625. Readability is still `good` (parseability 0.875 ≥ 0.85), and confidence is `medium` (fewer than 100 words). Note that "Responsible" and "Worked" are not in the action-verb list, so neither bullet counts as starting with an action verb.

### 2.6 Boundary conditions

| Situation | Effect |
|---|---|
| No experience entries | `dated_roles` and `entry_structure` are `not_applicable`; structure is evaluated only from project entries, if any |
| No experience and no project entries | `structure` has no items → excluded and re-normalised |
| No bullet points detected | `impact` excluded (common with PDFs whose bullets are drawn as graphics; see [RESUME_AND_JD_PARSING.md](RESUME_AND_JD_PARSING.md#9-investigation-why-the-same-resume-scores-differently-as-pdf-and-docx)) |
| Fewer than 20 words | no numeric score; only the extraction recommendation is produced |
| DOCX laid out with a table | `reading_order` warns (−2.08 points if nothing else changes) |
| PDF longer than 3 pages | `length` warns; a DOCX has no page count, so only its word count is used |

---

## 3. Job Match

**Function:** `scoreJobMatch({ jobProfile, assessments, eligibility })` → `{ score, keywordCoverage, gate, summary }`. It is never computed without a job.

### 3.1 Which component a requirement belongs to

| Requirement type | Component | Type weight |
|---|---|---|
| `skill`, `skill_group` with importance `required` | `required_skills` | 1 |
| `skill`, `skill_group` with importance `preferred` or `contextual` | `preferred_skills` | 1 |
| `experience_years` | `experience` | 2 |
| `education` | `education` | 1.5 |
| `certification` | `certifications` | 1 |
| `responsibility` | `responsibilities` | 1 (always `not_evaluated` today, so excluded) |
| `language`, `work_authorization`, `clearance`, `location` | none (eligibility only) | not scored |

### 3.2 Importance weights

| Importance | Weight | How the JD parser assigns it |
|---|---|---|
| `required` | 1 | A required cue in the statement ("must", "required", "minimum", "at least", "essential"…), or any statement under a heading containing required, requirements, minimum, basic or must |
| `preferred` | 0.3 | A preferred cue ("preferred", "nice to have", "a plus", "bonus", "familiarity with", "exposure to"…), a negation ("not required", "optional"), or a preferred section |
| `contextual` | 0.15 | Everything else: responsibilities, a plain "Qualifications" or "Skills" heading, the intro or about-us text |

The item weight is $w = \text{typeWeight} \times \text{importanceWeight}$.

### 3.3 Credit per status

| Assessment status | Credit $c$ | Deduction cause |
|---|---|---|
| `met` | assessment credit × evidence-strength factor. For skills: strong 1, moderate 0.9, weak 0.8. For other types: × 1. | `weak_evidence` if the factor is below 1 |
| `partially_met` | assessment credit × strength factor. For example SQL implied by PostgreSQL: 0.9; education in the right level but unknown field: 0.7 | `implied_only` (skills) or `partial` |
| `missing` | 0 | `missing` |
| `insufficient_evidence` | experience: $\min(1, \text{demonstratedMonths} / \text{requiredMonths})$; any other type: **0.25** | `insufficient_evidence` |
| `not_evaluated` | excluded from the denominator | none |

Evidence strength comes from **where** the best mention sits (`SECTION_STRENGTH` in `matchSkills.js`): experience → strong; projects or certifications → moderate; education, skills list, summary or header → weak.

### 3.4 The aggregation reduces to a weighted average

In Job Match, each component's weight is the **sum of its items' weights** ($W_k = \sum_{i \in k} w_i$). Substituting into the shared formula:

```math
\text{score}
= \sum_k 100 \cdot \frac{W_k}{\sum_j W_j} \cdot \frac{\sum_{i \in k} w_i c_i}{W_k}
= 100 \cdot \frac{\sum_{i} w_i \, c_i}{\sum_{i} w_i}
```

So **Job Match is the weighted average credit over all scored requirements**. The components exist to explain where points went, not to impose fixed percentages. This was checked numerically: in the worked example the reported score was 77.9 and the recomputed weighted average 77.859.

A useful consequence for interviews: with ten required skills and one preferred skill, each required skill is worth 100 ÷ 10.3 ≈ 9.7 points and the preferred one ≈ 2.9. A preferred requirement can never outweigh a required one of the same type.

### 3.5 What is excluded, and when the score is `null`

- `not_evaluated` assessments (responsibilities) are excluded, and the confidence reasons say so.
- Eligibility-only types (language, work authorisation, clearance) are never scored.
- A duplicated `canonicalKey` is scored only once.
- If no requirement is scoreable, `score: null` with a reason: either "The job description has no extractable requirements…" or "None of the job requirements could be scored…".

### 3.6 Confidence label and keyword coverage

| Confidence | Condition |
|---|---|
| `low` | fewer than 3 scored requirements |
| `medium` | any `insufficient_evidence` item, or fewer than 5 scored requirements |
| `high` | otherwise |

The reasons list also repeats the eligibility gate message. `keywordCoverage.required` and `keywordCoverage.preferred` give the share of skill requirements of that importance that are met or partially met (`null` when there are none). Both are returned by the API but **not displayed** in the UI.

### 3.7 The eligibility gate never changes the number

`buildGate(eligibility)` returns `{ eligibilityStatus, hardKnockout, knockoutRequirementIds, message }`. `hardKnockout` is true only when the eligibility status is `likely_filtered`. The score is **not capped or reduced**, a decision recorded in `server/src/engine/scoring/README.md` and `runAnalysis.js`. The reason is that the `ScoreBreakdown` contract requires the score to equal its contributions, and an evidence score should stay an honest measure of evidence. The gate is stored in `summary.jobMatch.eligibility` and `hardKnockout`, and shown as a separate alert.

### 3.8 Worked example

The full table is in [ANALYSIS_PIPELINE.md §3.7](ANALYSIS_PIPELINE.md#37-job-match-stage-17). In brief: 8 scored requirements, $\sum w = 8.1$, $\sum wc = 6.3067$, so the score is $100 \times 6.3067 / 8.1 = 77.86 \rightarrow 77.9$.

| Component | Effective weight | rawScore | Contribution |
|---|---|---|---|
| required_skills (React 1, Node.js 1, SQL 0.9, Java 0) | 4 ÷ 8.1 = 0.4938 | 0.725 | 35.80 |
| preferred_skills (AWS 0, Docker 0.8; weight 0.3 each) | 0.6 ÷ 8.1 = 0.0741 | 0.40 | 2.96 |
| experience (40 of 48 months) | 2 ÷ 8.1 = 0.2469 | 0.8333 | 20.58 |
| education (met) | 1.5 ÷ 8.1 = 0.1852 | 1.0 | 18.52 |
| certifications, responsibilities | 0 | n/a | 0 |
| **Total** | | | **77.86 → 77.9** |

### 3.9 Boundary conditions (all covered by `scoring.test.js`)

| Situation | Result |
|---|---|
| Everything met with strong evidence | 100 |
| Everything missing | 0 |
| Everything `insufficient_evidence` (non-experience) | 25, with confidence `low` or `medium` |
| A JD with only preferred requirements | Scored normally (relative weights within the preferred set) |
| A JD with zero requirements | `null` with a reason |
| A critical knockout | Score unchanged; `hardKnockout: true` |

---

## 4. Taxonomy and exact matching

### 4.1 What the taxonomy is

`server/src/engine/taxonomy/data.js` is a hand-curated list of **80 canonical skills** in 12 populated categories (programming languages 15, backend 11, frontend 10, database 8, testing 7, tools 6, devops 5, AI/ML 5, cloud 4, data 4, version control 3, mobile 2; the declared `other` category is empty). Version `2026.1` (`taxonomy/version.js`) is recorded in every result as `engine.taxonomyVersion`, so a stored analysis remains attributable to the vocabulary that produced it.

Each entry has:

| Field | Meaning | Example |
|---|---|---|
| `id` | Stable canonical id (lowercase; may contain `. + # / -`) | `node.js`, `c++`, `c#`, `ci/cd` |
| `name` | Display name | `Node.js` |
| `exact` | Spellings that *are* the skill | `postgresql` |
| `aliases` | Other unambiguous names | `postgres`, `postgres db` |
| `ambiguous` | Common short words that need context | `c`, `go`, `r`, `spring`, `spark` |
| `implies` | One-hop partial-credit edges, never equality | `postgresql → sql (0.9)` |
| `conflictsWith` | Pairs that must never be treated as equivalent | `java ↔ javascript` |

`validateTaxonomy()` checks the data's integrity (valid ids, no alias claimed by two skills, implications pointing at known skills, no pair that both implies and conflicts). It returned 0 errors on 2026-10-20 and is tested in `taxonomy.test.js`.

### 4.2 Recognition algorithm (`recognize(text)`)

1. All surfaces (exact and alias spellings) are compiled once and sorted **longest first**.
2. Each surface is matched case-insensitively with **boundary guards**:

   ```js
   // server/src/engine/taxonomy/taxonomy.js
   new RegExp(`(?<![A-Za-z0-9+#.])${escapeRegex(surface)}(?![A-Za-z0-9+#])`, 'gi')
   ```

   The character before a match may not be a letter, a digit, `+`, `#` or `.`; the character after may not be a letter, a digit, `+` or `#`.
3. Candidates are sorted by position (longest first at the same position), and **overlapping candidates are discarded**, so "React Native" consumes "React" and "C++" is never also "C".
4. Only the first mention of each skill per line is kept.
5. Each match records `recognition`: `canonical` (confidence 0.98), `normalized` (0.98), or `alias` (0.9); ambiguous surfaces get 0.8.

**Ambiguous names** are accepted in a resume only on the skills-section line or on a line that also contains an unambiguous skill. In a JD they are accepted only in requirements or preferred sections. Example (verified): "Helped the team go live" → no `go`; "Used R for statistics with Python" → `r` and `python`.

### 4.3 Why Java ≠ JavaScript, C ≠ C++ ≠ C#, React ≠ React Native

| Pair | Mechanism |
|---|---|
| Java vs JavaScript | "Java" cannot match inside "JavaScript" because the next character `S` is a letter. Separate canonical ids. A `conflictsWith` pair, so no implication can ever bridge them. If a JD wants Java and the resume only has JavaScript, the miss is explained: "Not matched: JavaScript is not Java." |
| C vs C++ vs C# | The surface `c` cannot match before `+` or `#` (lookahead). The longest-first rule takes `c++`/`c#`. Three distinct ids, pairwise forbidden. `c` is also ambiguous, so it needs context. |
| React vs React Native | "react native" is longer, so it wins at the same position; `react` and `react-native` are distinct ids and conflict. React Native experience does **not** satisfy a React requirement, and vice versa. |
| Node.js vs JavaScript | Distinct ids and a forbidden pair: Node.js experience is not automatically JavaScript, and listing JavaScript is not Node.js. |

Verified with the real recogniser on 2026-10-20: `"Java and JavaScript and TypeScript"` → java, javascript, typescript; `"C, C++ and C# were used."` → c (ambiguous), c++, c#; `"Built apps in React Native and React."` → react-native, react.

### 4.4 Implied (partial) matches

| Resume skill | Implies | Weight |
|---|---|---|
| PostgreSQL, MySQL | SQL | 0.9 |
| SQLite | SQL | 0.8 |
| Next.js | React | 0.8 |
| Ruby on Rails | Ruby | 0.8 |
| Django, Flask, FastAPI | Python | 0.7 |

An implied match produces `partially_met` with credit equal to the edge weight. The evidence points at what the resume literally says ("PostgreSQL"), never at the inferred concept. React does **not** imply JavaScript (tested). Implications are one hop only, and never cross a forbidden pair.

### 4.5 Matching order (`matchSkill()`)

1. **Direct** (exact, normalised or alias recognition of the same canonical id) → `met`, credit 1.0, using the best mention (experience > projects > certifications > education > skills > summary).
2. **Implied** (a resume skill with an `implies` edge to the required skill) → `partially_met`, credit equal to the weight (the highest weight wins; up to 10 alternatives are kept).
3. **Missing**, with the forbidden sibling named when one is present.

`skill_group` ("any of A, B, C") is supported by `matchSkillGroup()`, but the current JD parser never creates such requirements.

### 4.6 Semantic matching: inactive

The `MatchResult` contract still allows `method: 'semantic'` (with similarity, threshold and calibration fields), and also `'category'`. **No code produces either.** The legacy embedding matcher (Transformers.js, MiniLM) was deleted. Today, matching is exact, normalised, alias and implied only. If asked "do you use embeddings?", the honest answer is: not in the current production path.

### 4.7 Known false positives of a dictionary approach (verified 2026-10-20)

| Text | Recognised as | Why |
|---|---|---|
| "I took a short **rest** between sprints." | REST API | `rest` is an exact surface and not marked ambiguous |
| "Able to **express** complex ideas." | Express | Same reason |
| "Optimised a graph **node** traversal." | Node.js | `node` is an alias of `node.js` |
| "Delivered **swift** responses." | Swift | Same reason |

These can add spurious skill mentions (affecting Resume Health's skill counts and, rarely, a skill match). The fix would be to mark these surfaces as ambiguous (a taxonomy data change and version bump). Not done; recorded in [KNOWN_LIMITATIONS_AND_ROADMAP.md](KNOWN_LIMITATIONS_AND_ROADMAP.md).

### 4.8 Coverage limits

Only the 80 skills above are recognised. A JD asking for jQuery, Spring Batch, Excel or soft skills produces no skill requirement for those (soft skills are listed separately in `jobProfile.softSkills` and are not scored). The taxonomy was deliberately kept small and accurate rather than large and loose.

---

## 5. Evidence

### 5.1 What counts as evidence

An `Evidence` object (`server/src/domain/contracts/evidence.js`) is an addressable, verbatim piece of the resume:

| Field | Meaning |
|---|---|
| `id` | Deterministic: `ev_` plus a hash of the skill id, line index and character start (for skills), or of the entry id (for entries, education and certifications) |
| `kind` | `bullet`, `entry_header`, `tech_stack`, `skills_list`, `summary`, `certification`, `education` |
| `section`, `entryId` | Where it lives |
| `refs` | `[{ lineIndex, start, end }]` pointing into the `NormalizedDocument` |
| `snippet` | The **original** line text (verbatim, including any bullet glyph), at most 300 characters |
| `skillIds`, `dates` | What it shows, and the dates of the owning entry |
| `strength` | `strong`, `moderate` or `weak`, by section |
| `strengthFactors` | `applied_in_role`, `applied_in_project`, `quantified_outcome`, `recent` (within 24 months of the reference date), `dated`, `declared_stack`, `listed_only`, `credential`, `summary_claim` |

### 5.2 How evidence is linked

The matcher computes evidence ids with `evidenceIdFor(mention)`. The evaluator's registry builds the full `Evidence` objects using **the same function**, so ids line up by construction. `assertReferentialIntegrity()` (in `evaluate.js`) throws if any assessment or finding cites an id that was not registered, and the `AnalysisResult` contract checks it again.

### 5.3 What happens when evidence is absent

No evidence means no `best` match. A `met` or `partially_met` status *requires* a best match with at least one evidence id (the contract enforces this). So an evaluator that cannot ground its claim must downgrade it; for example education becomes `insufficient_evidence` when the degree line cannot be quoted.

### 5.4 How false positives are reduced

- Boundary-safe recognition and forbidden pairs (section 4)
- Ambiguous names require context
- Evidence strength separates "used in a role" from "listed"
- Experience is established only from explicit date ranges; certifications only from the certifications section; work authorisation and clearance only from explicit statements
- Nothing is inferred from names, locations, employers or the language the resume is written in

---

## 6. Eligibility and knockouts

### 6.1 Match score versus eligibility

- **Match score**: how much evidence the resume shows for the requirements, a graded measure.
- **Eligibility**: whether an explicit **hard constraint** (clearance, work authorisation, minimum years, degree, certification, language) appears to be violated, a gate.

They answer different questions and are stored side by side. A candidate can match 95% and be filtered by a missing clearance, or match 40% and be fully eligible.

### 6.2 Findings and outcomes

Evaluators emit a `KnockoutFinding` only for requirements with `isHardConstraint: true`:

| Requirement type | Hard when… | Severity | Possible outcomes |
|---|---|---|---|
| work_authorization | **always** (set by the parser) | `critical` | `passed` (explicit positive statement), `failed` (explicit negative: "require sponsorship", "not authorized"), `unknown` (silence) |
| clearance | **always** | `critical` | `passed`, `failed` ("No security clearance"), `unknown` |
| experience_years | importance is `required` | `high` | `passed`, `unknown` (never `failed`) |
| education | importance is `required` | `high` | `passed`, `at_risk` (degree present but partial), `unknown` |
| certification | importance is `required` | `high` | `passed`, `unknown` (a missing certification can be obtained, so it is not a disqualification) |
| language | importance is `required` | `high` | `passed`, `unknown` |
| skill | flag computed but **unused** | n/a | Skills never produce findings: a missing skill is never a knockout |

### 6.3 The single rule

```js
// server/src/domain/contracts/eligibility.js
function deriveEligibilityStatus(findings) {
  const isFailedCritical = (f) => f.severity === 'critical' && f.outcome === 'failed' && f.confidence >= 0.6;
  if (findings.some(isFailedCritical)) return 'likely_filtered';
  const needsReview = findings.some(
    (f) => f.outcome === 'at_risk' || f.outcome === 'failed' || (f.severity === 'critical' && f.outcome === 'unknown'));
  return needsReview ? 'review' : 'clear';
}
```

| Status | Meaning | UI |
|---|---|---|
| `clear` | No concern found | Green "No eligibility concerns" |
| `review` | Something could not be confirmed (for example, the resume is silent about a required clearance) or is partially met | Amber "Eligibility needs review" |
| `likely_filtered` | An explicit statement shows a critical requirement is not met | Red "Likely filtered by a hard requirement"; a `critical` recommendation |

Note the asymmetry: a `high`-severity `unknown` (for example, years not established) does **not** move the status away from `clear`; only critical unknowns trigger `review`.

### 6.4 Why missing evidence is not proof

A resume is a summary, not a complete record. Saying "no clearance" when the resume is silent would wrongly filter candidates and invite them to make false claims. The engine reports `unknown` or `insufficient_evidence` and asks the user to verify, with an integrity note such as "State work authorization only if you actually hold it."

### 6.5 Known defect (verified)

The JD's work-authorisation pattern also matches phrases such as "visa sponsorship", which appears when an employer *offers* sponsorship (often under Benefits). Because work authorisation is always hard, such a JD plus a resume saying "I will require visa sponsorship" produced `likely_filtered`, `hardKnockout: true` and a critical recommendation in a test run. That is the opposite of the employer's intent. Test (18) in `eligibility.test.js` checks that a preferred requirement never produces a knockout, but it builds the requirement by hand with `isHardConstraint: false`, which the real parser never produces for work authorisation or clearance. Recorded in [KNOWN_LIMITATIONS_AND_ROADMAP.md](KNOWN_LIMITATIONS_AND_ROADMAP.md).

---

## 7. Recommendations

### 7.1 Where recommendations come from

`buildRecommendations({ resumeHealth, jobMatch, evidence })`. **No LLM.** A recommendation exists only if one of these deterministic sources exists:

1. a Resume Health deduction (scope `resume`), or
2. a requirement whose assessment is not fully satisfied, or a knockout finding (scope `job`).

`assertGrounded()` throws if a recommendation has no source, or cites an unknown requirement, evidence or finding id.

### 7.2 Resume-scope rules (`resumeRules.js`)

Related findings collapse into one recommendation:

| Rule | Triggered by deductions on | Category | High priority when failed? |
|---|---|---|---|
| `REC-PARSE-TEXT` | `text_layer` | parseability | yes |
| `REC-PARSE-CHARACTERS` | `encoding`, `icon_glyphs` | parseability | |
| `REC-PARSE-LAYOUT` | `reading_order` | parseability | |
| `REC-PARSE-HEADINGS` | `standard_headings` | parseability | |
| `REC-PARSE-LENGTH` | `length` | parseability | |
| `REC-PARSE-EMBEDDED-INSTRUCTIONS` | `embedded_instructions` | parseability | yes |
| `REC-STRUCT-ROLE-HEADINGS` | `dated_roles`, `entry_structure` | format | |
| `REC-STRUCT-ENTRY-CONTENT` | `STRUCT-ENTRY-CONTENT` | format | |
| `REC-TECH-NAME-SKILLS` | `TECH-SKILLS-RECOGNISED` | technical_content | |
| `REC-TECH-DEMONSTRATE-SKILLS` | `TECH-SKILLS-DEMONSTRATED`, `TECH-ENTRY-SKILLS` | technical_content | |
| `REC-IMPACT-QUANTIFY` | `IMPACT-METRICS` | content_quality | |
| `REC-IMPACT-ACTION-VERBS` | `IMPACT-ACTION-VERBS` | content_quality | |
| `REC-COMP-CONTACT` | `contact_email`, `contact_phone`, `COMP-NAME` | completeness | yes |
| `REC-COMP-WORK-EVIDENCE` | `COMP-WORK-EVIDENCE` | completeness | yes |
| `REC-COMP-EDUCATION` | `COMP-EDUCATION` | completeness | |
| `REC-COMP-SKILLS-SECTION` | `COMP-SKILLS` | completeness | |

**Priority:** `high` if the rule is "high when failed" and one of its subjects failed, or if the points at stake are at least 6; `medium` if at least 2.5; otherwise `low`. `expectedImpact.scoreDelta` is the sum of the deductions' points.

### 7.3 Job-scope rules (`jobRules.js`): at most one per requirement

| Rule | When | Priority | Order |
|---|---|---|---|
| `REC-ELIGIBILITY-KNOCKOUT` | eligibility type with a critical `failed` finding | **critical** | 10 |
| `REC-SKILL-MISSING` / `REC-CERTIFICATION-MISSING` | required skill or certification missing | high | 20 |
| `REC-ELIGIBILITY-UNCONFIRMED` | eligibility type not confirmed | high if hard, else low | 30 |
| `REC-EXPERIENCE-EVIDENCE`, `REC-EDUCATION-EVIDENCE` | insufficient evidence | high if required, else low | 30 |
| `REC-SKILL-RELATED-ONLY` | skill `partially_met` (implied) | medium if required, else low | 45 |
| `REC-EDUCATION-PARTIAL` | education `partially_met` | medium if required, else low | 45 |
| `REC-SKILL-OPTIONAL-MISSING` / `REC-CERTIFICATION-OPTIONAL-MISSING` | preferred or contextual missing | low | 50 |
| `REC-ELIGIBILITY-NOT-MET` | eligibility `missing` without a critical failure | low | 55 |
| `REC-SKILL-WEAK-EVIDENCE` | skill met, but only with weak evidence | medium if required, else low | 60 |

Fully met requirements and `not_evaluated` ones (responsibilities) produce **nothing**. Resume-scope items use order 40 (high), 60 (medium) or 70 (low).

**Sorting:** priority (critical → low), then rule order, then points at stake (largest first), then id. Preferred requirements can never rise above `low`.

**De-duplication:** one recommendation per `canonicalKey`, and related Resume Health findings are merged into one rule (for example email, phone and name → one contact recommendation).

### 7.4 Truthful-edit rules

| Situation | What the engine says |
|---|---|
| Evidence exists but is weak (only listed) | Show the skill in the role or project where it was used |
| Only related evidence (PostgreSQL for SQL) | Name SQL explicitly *if* you have direct experience |
| No evidence | Explain the gap; add it only if true; otherwise leave it out and consider learning it |
| Eligibility knockout | Verify eligibility; "Rewording the resume cannot resolve an eligibility requirement." |
| Eligibility unknown | "This is not a failure." Verify, and state it only if held |

Every action that suggests adding content has an `integrityNote` (tested in `recommendations.test.js`, "every action that asks the user to add or state something carries an integrity note").

### 7.5 Why AI does not create or rank recommendations

Recommendations must be reproducible, grounded in ids and safe (never "add Kubernetes to your resume"). The AI `recommendation_wording` task can only *re-phrase* existing ones by id. It cannot add, merge, drop or re-prioritise, and it must keep conditional phrasing ("if you have genuine experience…"), or the item is dropped ([AI_INTEGRATION.md](AI_INTEGRATION.md)).

---

## 8. Documentation versus implementation discrepancies

| Statement in an existing document | What the code does | Impact |
|---|---|---|
| `engine/scoring/README.md`: "year-only dates are not widened" | `monthInterval()` interprets a closed year-only range as **January to December**. "2020 – 2021" counts as 24 months (the widest reading), while `computeDuration()` would estimate 13. | Experience can be over-estimated for year-only dates |
| `engine/evaluation/README.md`: "preferred or contextual requirements never produce findings" | True for experience, education, certification and language. **Not true for work authorisation and clearance**, which the parser always marks hard, even when contextual. | Can create critical findings from Benefits text (section 6.5) |
| `engine/scoring/README.md` lists "location" as an eligibility-only requirement type | The JD parser **never creates** `location` requirements; only `jobProfile.location` is filled | No location eligibility checks exist |
| `resumeHealth.js` contract lists a `header_footer_content` check id | **Never computed.** `layout.headerFooterLineIndexes` is always `null` | No header or footer detection |
| `engine/recommendations/README.md`: "Responsibilities and location produce no recommendations (not evaluated yet)" | Accurate | none |
