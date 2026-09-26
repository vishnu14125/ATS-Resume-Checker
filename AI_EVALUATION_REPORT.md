# AI Evaluation Report

```json
{
  "datasetVersion": "1.0",
  "cases": 2,
  "schemaValidation": "PASS",
  "groundingChecks": "PASS",
  "hallucinationChecks": "PARTIAL",
  "deterministicChecks": "PASS"
}
```

## Methodology
The evaluation relies on structural segregation testing (`aiEvaluation.test.js`), targeting the two core AI responsibilities: deterministic grading and LLM text generation. 

## Deterministic Results
**Evaluator:** `SkillMatcher` & `ScoringEngine` unit and integration tests.
**Result:** **PASS**
- **Consistency:** Inputting the same arrays of matched skills to the ScoringEngine produces an identical mathematical score. Missing required skills heavily penalize the score deterministically.
- **Aggregation:** Multi-JD analysis uses strict Javascript Sets to build frequencies rather than asking the LLM to count elements.

## Human-Reviewed LLM Results
**Evaluator:** Local structural testing and manual review.
**Result:** **PASS / PARTIAL**
- **Schema Compliance (PASS):** Zod guarantees schema stability. Retries successfully auto-correct `invalid_enum_value` hallucinations.
- **Grounding (PASS):** The Learning Roadmap reliably returns "Evidence not detected" rather than assuming candidates lack skills not mentioned.
- **Hallucination (PARTIAL):** While the LLM cannot fabricate scoring metrics due to the deterministic scoring engine bypass, it is theoretically possible for advanced prompt injection to coax the LLM into generating unrelated "Interview Questions" within the bounds of the JSON format. This residual risk is documented and mitigated via explicit system directives commanding the model to distrust user payloads.
