# ATS Intelligence V2 - Phase 5E: Knockouts & Deterministic Recommendations Report

## 1. Evidence Architecture
We have created `EvidenceEngineV2.js` and `evidenceSchemaV2.js` to normalize the output from the `MatcherV2` and the Phase 5C `IntelligenceAnalyzers`. 
This establishes a uniform `EvidenceRecord` structure for every job requirement, tracking:
- **`matchType`**: `exact`, `normalized`, `alias`, or `missing`. (Note: `semantic` is reserved for Phase 5F, and currently not implemented).
- **`status`**: `MATCHED`, `PARTIAL`, `MISSING`, `UNKNOWN`, `NOT_APPLICABLE`.
- **`resumeEvidence`**: Points directly to the section and original source text of the resume that triggered the match.

## 2. Evidence Hierarchy
Evidence strength is strictly deterministic based on where the match was found, avoiding AI hallucination.
Hierarchy: `experience` > `projects` > `certifications` > `education` > `skills` > `summary` > `other`.
If a candidate has "React" in both `skills` and `experience`, the engine correctly prioritizes the `experience` evidence because it carries stronger implicit verification of practical usage.

## 3. Requirement Status Model
No requirements are silently dropped or ignored.
- A requirement that is fully satisfied becomes `MATCHED`.
- A requirement that is numerically deficient (e.g. 2 years React when 3 is required) becomes `PARTIAL`.
- A requirement with zero exact/alias evidence becomes `MISSING`.

## 4. Knockout Rules
The `KnockoutAnalyzerV2` evaluates only **required** skills/experiences against the `EvidenceRecord`. 
- Missing preferred skills do NOT generate knockouts.
- A missing required skill yields a `critical` severity diagnostic.
- A partial experience match yields a `high` severity diagnostic.
- Explicit `certification` and `education` requirements generate explicit knockout reasons detailing that general experience or student status cannot be used to infer the missing credential.
- **Important:** Knockout diagnostics are completely independent of the Job Match Score. A missing requirement proportionally dilutes the continuous score but does not forcefully reset the overall score to `0`.

## 5. Recommendation Rules
The `RecommendationEngineV2` generates prescriptive, actionable feedback strictly tied to deterministic evidence.
1. **Skill Gap (`skill_gap`)**: Advises the candidate to add missing requirements *only if they genuinely possess the experience*.
2. **Experience Gap (`experience_gap`)**: Warns if demonstrated duration is shorter than required.
3. **Evidence Strength (`evidence_strength`)**: If a critical skill only appears in a "Skills" list, it recommends demonstrating its usage in an active project or experience bullet to strengthen ATS validation.
4. **Parseability (`parseability`)**: Consumes warnings from Phase 5D to recommend formatting corrections.
- **Invariant:** The engine never hallucinates metrics or asks the candidate to invent skills they do not have.

## 6. Score Traceability
The `ScoringEngineV2` has been retrofitted to process `EvidenceRecord`s. The `score()` output now provides rich tracing for every component score:
```json
{
  "component": "experience",
  "requirement": "React",
  "points": 4.5,
  "evidenceIds": ["exp-001"],
  "matchType": "exact",
  "evidenceStrength": "experience"
}
```
If a match has no valid `EvidenceRecord`, it cannot contribute to the Job Match Score.

## 7. False-Positive Protections
- `Student status` is explicitly prevented from matching completed degree requirements.
- `React Native` vs `React` and `Java` vs `JavaScript` boundaries are strictly preserved via the V2 `MatcherV2` outputs, preventing incorrect inheritance.
- Experience duration overlaps are properly merged (Phase 5C) before `EvidenceEngineV2` translates them into `PARTIAL` or `MATCHED` statuses.

## 8. Exact Readiness Status
- **Files created:** `evidenceSchemaV2.js`, `EvidenceEngineV2.js`, `KnockoutAnalyzerV2.js`, `RecommendationEngineV2.js`
- **Tests added:** 13 new explicit tests for the new components.
- **Total backend tests:** 178
- **Limitations:** Cannot perform semantic fuzzing. If an employer asks for "Frontend Engineering" and the resume only lists "React/CSS", it will be marked `MISSING` because semantic matching belongs in Phase 5F.
- **Production Integration:** `api/analyze`, MongoDB models, and ResultsPage UI remain completely untouched as requested. We are pending Phase 5F semantic matching before production integration.

**Status: Phase 5E is completed successfully.**
