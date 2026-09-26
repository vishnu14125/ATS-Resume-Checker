# ATS Intelligence V2 - Phase 5C Hardening Report

## 1. What was audited
- **Experience Dates:** Date normalization, timezone offsets, missing fields.
- **Experience Overlaps:** Interval merging for concurrent jobs, segregation by skill.
- **JD Experience Parsing:** Proper extraction of duration from varied phrasings.
- **Project Evidence:** Strict dependency on MatcherV2 output to prevent hallucinations.
- **Education Behavior:** Degree string parsing, canonical mapping, regex boundaries.
- **Certification Behavior:** Strict substring mapping without creating false positives.
- **Scoring Invariants:** Proportional calculations, point distributions, 0..100 boundary.

## 2. Bugs found
- `EducationAnalyzerV2` had a critical regex flaw where substring matches (`ba`) would erroneously trigger matches for `bachelor` because of missing word boundaries `\b`.
- `EducationAnalyzerV2` had another regex flaw where strings with dots (like `B.Tech`, `M.Sc`) failed to match correctly when using naive `.includes()` or simple word boundaries `\b` since `.` is a non-word character.
- `ExperienceAnalyzerV2` relied heavily on `new Date()` internally for `Present/Current` logic, making unit tests non-deterministic when run in future years.
- `CertificationAnalyzerV2` did not use word boundaries, meaning it could incorrectly match if a certification name was a substring of another word, and it had a test failure due to ordering of `aws certified` matching before `aws solutions architect`.

## 3. Fixes made
- **Date Hardening:** Refactored `ExperienceAnalyzerV2` to strictly accept `referenceDate = new Date()` allowing deterministic tests.
- **Interval Merging:** Enforced distinct skill interval tracking in `ExperienceAnalyzerV2` to ensure overlapping dates for the *same* skill correctly merge without double counting, but dates for *different* skills remain distinct.
- **Regex Robustness:** Refactored `EducationAnalyzerV2` to use `(^|[^a-zA-Z0-9_])` + escaped alias + `([^a-zA-Z0-9_]|$)` instead of `\b` to guarantee that dots inside acronyms (`M.Sc`) are cleanly bounded and exactly matched.
- **Test Hardening:** Added 21 dedicated hardening tests covering overlapping dates, malformed inputs, strict requirements mapping, and false positive prevention.

## 4. Date behavior
Dates are parsed deterministically relative to the provided `referenceDate`. Future dates are capped at the reference date, invalid dates default gracefully, and missing end dates default to the start date (1 month).

## 5. Overlap behavior
Overlapping dates for the exact same skill are merged mathematically.
For example, if you worked Job A (Jan 2022-Dec 2022) with React, and Job B (Jul 2022-Jun 2023) with React, it calculates exactly 17 months of React experience, not 23.

## 6. JD duration behavior
Parses explicit phrases (`3+ years of React`, `2 years Node.js`) and deduplicates requirement durations by taking the strict maximum required duration.

## 7. Project evidence behavior
Strictly tied to `MatcherV2`. No project gets points just for existing. If `MatcherV2` says `React Native` was a knockout for `React`, then the project containing `React Native` will provide absolutely 0 evidence for `React`.

## 8. Education behavior
Canonical normalization maps robustly using boundaries. `Computer Science student` does NOT become a `bachelors`. `B.S. in Biology` correctly fails a `masters` requirement.

## 9. Certification behavior
Evaluates only explicit arrays and strictly matches the known certification taxonomy.

## 10. Scoring invariants
`ScoringEngineV2` enforces strict point ceilings per category. Missing required skills drop points proportionally. Scores never exceed 100 or drop below 0.

## 11. Test results
- **Phase 5C Hardening Tests:** Added 21 new explicit hardening tests.
- **Total Unit Tests for V2 Pipeline:** 62 tests across the 5 analyzers.
- **Total Backend Regression Suite:** 155 tests.
- **Status:** 155 / 155 tests are PASSING with 0 failing test suites.

## 12. Remaining limitations
- Dates like "Spring 2022" are not parsed (fallback to year 2022).
- Non-standard acronyms not explicitly defined in `EducationAnalyzerV2` degree map might be missed.
- The pipeline does not yet semantically understand that "Frontend developer" intrinsically uses "HTML/CSS".

## 13. Exact readiness status
The deterministic Phase 5C local-first baseline pipeline is now **robust, deterministic, and extensively validated**. It is fully ready to serve as the bedrock layer for Phase 5D (Optional AI Enhancement), but it is **not yet integrated into the production API or UI endpoints**.
