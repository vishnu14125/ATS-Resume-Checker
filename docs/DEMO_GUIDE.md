# Demo Guide

> A ready-to-use script for demonstrating ATS Resume Checker in a college review, an internship interview, to a recruiter, or to a technical interviewer. It uses only fictional data and contains no credentials. Pair it with [INTERVIEW_PREPARATION.md](INTERVIEW_PREPARATION.md) for follow-up questions.

---

## 1. Preparation checklist

**The day before**

- [ ] Run the backend tests (`cd server && npx jest --runInBand`); expect 22 suites and 442 tests passing.
- [ ] Decide whether you will show AI. If yes, set `AI_PROVIDER`, the key **and `AI_MODEL`** in `server/.env`, restart, and generate questions once to confirm the provider works. Providers can return 503 or rate-limit errors, so test early.
- [ ] Create the demo documents (section 3) as **pasted text and a DOCX** (DOCX gives the cleanest structure). Keep a PDF version only if you want to show the PDF limitation on purpose.
- [ ] Create a demo account ahead of time with a made-up address such as `demo.user@example.com`. Login is limited to 10 attempts per 15 minutes per IP, so don't create several accounts during the demo.
- [ ] Optionally pre-run one analysis so the dashboard isn't empty.

**30 minutes before**

- [ ] Start MongoDB, the backend and the frontend (section 2).
- [ ] Open `http://localhost:5000/api/health/ready` and confirm `"database": "up"`.
- [ ] Log in once in the browser; close other tabs; set browser zoom to about 110% for screen sharing.
- [ ] Have the code editor open on `server/src/application/analysis/runAnalysis.js` and `server/src/engine/scoring/jobMatch.js` in case a technical question comes up.

## 2. Startup commands

```bash
# 1) MongoDB (example: local)
mongod --dbpath /path/to/your/db-folder

# 2) Backend (terminal 1)
cd server
npm run dev            # expect "server.started" in the JSON logs

# 3) Frontend (terminal 2)
cd client
npm run dev            # http://localhost:5173
```

From the repository root, `npm run dev` starts the backend and frontend together.

## 3. Safe demo documents (fictional)

**Resume (save as `ananya-demo.docx`, or paste it):**

```text
Ananya Demo
Bengaluru, KA
ananya.demo@example.com | +91 98765 43210 | https://github.com/ananya-demo

SUMMARY
Full-stack developer who builds web applications with React and Node.js.

EXPERIENCE
Software Engineer | Nimbus Analytics Pvt Ltd | Jul 2023 - Present
- Built React dashboards used by 40 internal analysts.
- Designed REST APIs in Node.js and Express backed by PostgreSQL.
- Reduced report generation time by 35% by adding Redis caching.

Software Engineering Intern | Orbit Labs | Jan 2023 - Jun 2023
- Wrote unit tests with Jest for a JavaScript billing service.

PROJECTS
Campus Events Portal | React, Node.js, MongoDB
- Developed an events portal used by 600 students.

EDUCATION
B.Tech in Computer Science
Example Institute of Technology (2019–2023)

SKILLS
JavaScript, TypeScript, React, Node.js, Express, PostgreSQL, MongoDB, Redis, Docker, Git
```

**Job description (paste):**

```text
Full Stack Developer at Brightpath Software

About us
Brightpath builds hiring tools for small teams.

Responsibilities
- Build and maintain customer-facing web features.
- Review code and mentor junior developers.

Requirements
- 4+ years of professional software development experience.
- Strong experience with React and Node.js is required.
- Must have experience with SQL databases.
- Java is required for our legacy services.
- Bachelor's degree in Computer Science or a related field.
- Must be authorized to work in India.

Preferred Qualifications
- Experience with AWS is a plus.
- Familiarity with Docker.
```

**What to expect** (measured with reference date 2026-10-19; see [ANALYSIS_PIPELINE.md](ANALYSIS_PIPELINE.md#3-worked-example)): Resume Health **100**, Job Match **77.9**, eligibility **review** (work authorisation not stated), 11 requirements, 6 recommendations (Java missing, experience short of 4 years, work authorisation unconfirmed, SQL only via PostgreSQL, AWS missing, Docker only listed).

> The numbers can drift over time because "Present" resolves to the current month. From June 2027 the current role spans 48 months, so the experience requirement becomes "met". That is a nice talking point about reference dates.
>
> **If you make the DOCX in Word:** press Enter between the header lines (name, city, contact line). Do not use Shift+Enter line breaks, which the DOCX extractor currently glues together (known defect D3 in [KNOWN_LIMITATIONS_AND_ROADMAP.md](KNOWN_LIMITATIONS_AND_ROADMAP.md)).

**For a resume-only demo**, use the same resume without a JD. For a "weak resume" contrast, paste the short "Rahul Sample" resume from [SCORING_AND_MATCHING.md §2.5](SCORING_AND_MATCHING.md#25-worked-example) (Resume Health 68.6).

## 4. Screen sequence and what to say

| # | Screen | Show | Say (plain) | Technical detail to mention |
|---|---|---|---|---|
| 1 | Home | Hero, "PDF, DOCX or TXT", "Job description optional" | "It checks a resume on its own, or against a job." | React SPA, lazy-loaded routes |
| 2 | Log in | The form, then the dashboard | "Accounts keep your history private." | bcrypt hashing; JWT; every query scoped to the user |
| 3 | Analyze (resume only) | Drop the DOCX; the side panel says "Resume analysis" | "The JD is optional, so the mode switches automatically." | Multipart upload held in memory; type checked by bytes |
| 4 | Results: Overview | The Resume Health ring and breakdown | "Each component shows points earned out of points available." | Score + deductions = 100; empty components excluded |
| 5 | Results: Resume Health | Checks and findings | "These are parseability and content checks, each with a fix." | Deterministic rules; no AI |
| 6 | Analyze (job match) | Same resume plus the pasted JD; "Job match analysis" selected | "Now it compares against this specific job." | JD parsed into requirements with importance |
| 7 | Results: Overview | Job Match and Health side by side; the eligibility alert | "Two different questions, two scores; eligibility is reported separately and never lowers the score." | `deriveEligibilityStatus()`; the gate is beside the score |
| 8 | Results: Requirements | Missing (required): Java, "JavaScript is not Java"; Partially met: SQL via PostgreSQL; Matched with quotes; Not established: 4+ years, work authorisation | "Every status shows the exact resume line used as evidence." | Taxonomy forbidden pairs; implied matches at 0.9; evidence = verbatim line |
| 9 | Results: How to improve | Priorities and integrity notes | "It never tells you to add something unless it's true." | Recommendations derived from deductions and assessments, grounded by id |
| 10 | Results: Interview prep | Generate questions (if AI is configured) | "AI writes questions tied to requirements, but it can't change any score." | Grounding, injection guards, output stored separately |
| 11 | Dashboard | History; delete one analysis | "Everything is saved per user; delete is permanent." | Cursor pagination in the API; owner-scoped delete |

## 5. Five-minute script

1. **(0:00)** "This is ATS Resume Checker, a MERN app with a rule-based analysis engine. I'll show a resume check and then a job match."
2. **(0:30)** Upload the resume (no JD) → Overview: "Resume Health is 100 here, and you can see where every point comes from."
3. **(1:15)** New analysis with the JD → Overview: "Job Match 77.9, and eligibility needs review because work authorisation isn't stated. That's not a failure and doesn't change the score."
4. **(2:15)** Requirements: "Java is missing, and the reason explicitly says JavaScript is not Java. SQL is only partially met through PostgreSQL. Each match quotes the resume line."
5. **(3:15)** How to improve: "Recommendations are prioritised and tied to findings. Notice the integrity notes."
6. **(4:00)** Interview prep (or explain it if AI is off): "Optional AI generates questions tied to requirement ids; it's validated before saving and can't touch the scores."
7. **(4:30)** Close: "442 backend tests; known limitations include PDF structure parsing. Happy to walk through the code."

## 6. Ten-minute script

Do the five-minute script, then:

- **(5:00)** Show `server/src/application/analysis/runAnalysis.js`: "This is the whole pipeline in one function: ingest, parse, health, then for jobs: parse the JD, match, evaluate, score, then recommendations; and the result is validated against a contract before storing."
- **(6:30)** Show `server/src/engine/taxonomy/data.js` (the Java/JavaScript entries) and `taxonomy.js` `surfaceRegex()`: explain the boundaries.
- **(7:30)** Show `server/src/engine/scoring/jobMatch.js` `creditFor()` and walk through the 77.9 arithmetic (Σw = 8.1).
- **(8:30)** Show `server/src/application/ai/groundedAiService.js` `runTask()`: "A stored result is reused; a model call happens only on request; every outcome is a status."
- **(9:15)** Limitations and next steps (Level 8 of the interview guide), then questions.

## 7. If the AI provider is unavailable

- The button is disabled with "AI assistance is not available right now. Your analysis is unaffected." **That is the designed behaviour**, so show it: "AI is optional; everything else works without it."
- If a call fails mid-demo (503 or rate limit), a toast appears; click again after a few seconds. Earlier testing saw intermittent 503s from the provider.
- Back-up options: show `server/src/application/ai/tasks.js` (`interviewPrep.ground()`) and explain the checks, or show the `groundedAi.test.js` names ("a model that obeys the injection is rejected, and the analysis is untouched").

## 8. What not to claim

| Don't say | Say instead |
|---|---|
| "It works exactly like real ATS systems" | "It models how ATS software parses text and how recruiters filter on requirements; real systems vary." |
| "A high score means you'll get an interview" | "It's an explainable resume-quality and evidence metric, not a hiring prediction." |
| "It's production-ready" or "It's deployed" | "It's a well-tested prototype; it isn't deployed yet." |
| "AI analyses your resume" | "Rules analyse the resume; AI optionally explains the result." |
| "It understands any skill" | "It recognises 80 curated software and data skills accurately." |
| "Fully tested" or "100% coverage" | "442 backend tests across unit, real-file and HTTP levels; no frontend unit tests." |

## 9. Likely questions after the demo

| Question | Short answer |
|---|---|
| "Why is SQL only partial?" | The resume says PostgreSQL, which implies SQL with weight 0.9; SQL itself isn't stated. |
| "Why isn't the experience requirement 'missing'?" | Dates establish about 3.3 years, which can't prove 4+, so it's `insufficient_evidence` with a credit of 40 ÷ 48 months, not a failure. |
| "What if I upload a PDF?" | It works, but wrapped bullets can lower Resume Health a few points; I traced why ([RESUME_AND_JD_PARSING.md §9](RESUME_AND_JD_PARSING.md#9-investigation-why-the-same-resume-scores-differently-as-pdf-and-docx)). |
| "Is my resume stored?" | No file and no full text; only the structured result with short evidence lines, plus content hashes. |
| "What does the AI see?" | Only minimal facts, with contact details redacted, and only when you press the button. |
| "How long does an analysis take?" | About a tenth of a second for this example in-process (one measurement); no load testing yet. |
| "What would you build next?" | Fix the parser bugs found during documentation, add regression tests, then deploy with HTTPS. |
