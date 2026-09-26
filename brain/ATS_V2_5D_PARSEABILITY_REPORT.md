# ATS Intelligence V2 - Phase 5D: Parseability Engine Report

## 1. Architecture
We created a dedicated `ParseabilityAnalyzerV2` completely decoupled from the Job Match Score. This engine answers the question: *"How reliably can an ATS extract and understand this resume?"* 

It consumes deterministic parser output (`rawText`, `resumeProfile`, `documentMetadata`) without requiring Gemini or OpenAI, evaluating extraction completeness, noise, and structural clarity.

## 2. Scoring Dimensions & Weights
The engine scores components 0-100 and aggregates them. To satisfy the requirement to not over-penalize optional sections (projects, certifications), those sections dynamically redistribute weight if missing.

The baseline weights (if all present) are:
- **Text Extraction:** 25% (Length, density, word count, non-ASCII noise ratio)
- **Contact Extraction:** 20% (Email mandatory for high score, phone/location optional but helpful)
- **Experience Extraction:** 20% (Presence of entries, parseable dates, explicit titles)
- **Skills Extraction:** 15% (Presence of explicit skill tokens)
- **Education Extraction:** 10% (Presence of education, readable text)
- **Section Detection:** 10% (Ratio of expected standard sections successfully detected)
- **Project Extraction:** 5% (Optional; redistributed if missing)
- **Structure Quality:** 5% (Optional / text coherence hints; redistributed if missing)

## 3. Warning Model
The engine produces deterministic warnings for actionable ATS issues:
- `FATAL_TEXT_EXTRACTION`: Triggers if the extracted text length is exceptionally short (< 100 characters) or completely missing.
- `EXTRACTION_NOISE`: Triggers if non-standard characters exceed a safe threshold (e.g., > 20% garbage chars indicative of bad OCR).
- `MISSING_EMAIL`: Warns if contact extraction failed to find an email address.
- `WEAK_EXPERIENCE_DETECTION`: Warns if experience parsing fails or extracts entries without dates/titles.

## 4. Fatal Conditions
A resume fails fatally (score = 0, status = `fatal`) **only** if text extraction completely fails or yields unusable data (e.g., < 100 characters). Missing optional content (no projects, no certifications) correctly outputs `not_applicable` and retains a strong overall score.

## 5. Supported Metadata
The engine preserves the `documentFormat` from incoming metadata (e.g., `PDF`, `DOCX`, `TXT`) if available, but it strictly operates on the extracted text.

## 6. Unsupported Capabilities
The engine honestly documents its limitations in its output struct:
```json
"capabilities": {
  "visualLayoutAnalysis": "not_available",
  "ocrAnalysis": "not_available",
  "columnAnalysis": "not_available"
}
```
This is explicitly a deterministic text/extraction parseability engine, not a "visual ATS compatibility" checker. We cannot claim layout intelligence until an advanced multi-modal visual parser is introduced.

## 7. Tests
I added exactly **10 dedicated deterministic regression tests** for parseability:
1. Clean resume yields high parseability (Score >= 90).
2. Minimal resume missing optional sections does not catastrophically fail (Score >= 70).
3. No extracted text creates a clear fatal result.
4. Very short extraction triggers fatal status.
5. Corrupted text triggers `EXTRACTION_NOISE` warning.
6. Missing email yields `MISSING_EMAIL` warning.
7. Missing experience yields a poor experience score.
8. Missing skills yields poor skills extraction.
9. TXT metadata format is preserved.
10. Invariants: Score is strictly bounded between 0 and 100.

## 8. Exact Readiness Status
- **Files created:** `ParseabilityAnalyzerV2.js`, `parseabilitySchemaV2.js`, `parseabilityAnalyzerV2.test.js`
- **Files modified:** None from production.
- **Tests added:** 10 new parseability unit tests.
- **Tests passed:** 10/10 parseability tests, plus all 155/155 existing backend tests remain perfectly green.
- **Total backend tests:** 165
- **Limitations:** Cannot detect columns, margins, or visual elements like icons or tables.
- **Integration:** Production API (`/api/analyze`), MongoDB schemas, and frontend UI remain completely untouched as requested. We are pending production integration.

**Status: Phase 5D is completed successfully.**
