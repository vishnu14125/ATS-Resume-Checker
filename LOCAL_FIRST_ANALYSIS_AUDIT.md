# Local-First Analysis Audit

## 1. What analysis can already be performed without Gemini?
- **Text Extraction:** PDF, DOCX, TXT extraction via `documentService.js` is fully local.
- **Skill Matching:** `SkillMatcher.js` already runs locally and matches skills via exact match and embeddings (if available).
- **Scoring:** `ScoringEngine.js` already calculates the deterministic ATS score completely locally based on the skill matches.
- **Semantic Similarity:** `EmbeddingService.js` uses local `@xenova/transformers` (`all-MiniLM-L6-v2`) to perform semantic matching entirely without external APIs.

## 2. What functionality currently requires Gemini?
- **Structured Data Extraction:** Converting unstructured resume/JD text into structured JSON schemas (`extractResumeData`, `extractJobDescription`). This is currently the bottleneck because everything else depends on the structured output.
- **Recommendations:** Generating human-readable skill gap and resume structure advice.
- **Issue Detection:** Identifying weak action verbs, lack of measurable impact, and phrasing issues.

## 3. How many external AI calls are currently made per analysis?
- **Four (4):** Resume Extraction, JD Extraction, Recommendations Generation, Issues Detection.

## 4. Which parts of the current result schema require AI?
- `structuredResume` and `structuredJD` (Currently heavily relied upon by the entire backend and UI).
- `recommendations`
- `resumeIssues`

## 5. Which existing SkillMatcher/ScoringEngine functionality can generate the baseline result?
- If we feed `SkillMatcher` and `ScoringEngine` an array of extracted keywords and basic resume chunks instead of a deeply structured JSON, they can still perform the exact same normalized matching and scoring mathematics. 

## 6. Whether EmbeddingService can run locally?
- Yes. The `EmbeddingService.js` is already implemented using local Hugging Face Transformers (`@xenova/transformers`). It does not require API keys.

## 7. Whether the current frontend assumes every result came from AI?
- The frontend blindly renders whatever is inside `structuredResume`, `recommendations`, and `resumeIssues`. We need to gracefully populate these structures locally or handle their absence.

## 8. Database Schema Support
- The current MongoDB schema likely needs minor modifications (or is flexible enough) to store new metadata fields: `analysisMode`, `aiStatus`, `provider`.

## Conclusion & Next Steps
We must build `LocalATSAnalyzer.js` which uses regex, NLP algorithms, and predefined keyword dictionaries to deterministically convert raw resume and JD text into the `structuredResume` and `structuredJD` shapes without hitting Gemini. Once populated, `SkillMatcher` and `ScoringEngine` will operate normally. Gemini will then optionally take this baseline and enhance `recommendations` and `resumeIssues`.
