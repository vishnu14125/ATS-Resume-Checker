# ATS Resume Checker (2026 Edition)

An AI-Powered Career Intelligence & Job Preparation Platform.

## What it does
ATS Resume Checker transforms raw resumes and job descriptions into actionable, structured intelligence. It breaks down ATS scoring deterministically, maps skill gaps, provides personalized interview prep, and structures learning roadmaps.

## Key Features
- **Explainable Scoring:** Transparent breakdown of how your resume ranks against required and preferred skills.
- **Hybrid Intelligence:** Fuses deterministic skill matching algorithms with LLM contextual reasoning to prevent hallucinated scores.
- **Resume Optimization:** Suggests targeted factual rewrites of your experience bullet points based on the JD.
- **Career Intelligence:** Job-specific interview prep, learning roadmaps, and project relevance mapping.
- **Multi-JD Analysis:** Aggregate missing skill trends across multiple target jobs.

## AI Architecture
The application uses a provider-agnostic `AIEngine.js` supporting Gemini, OpenAI, and Groq.
LLM output is strictly coerced into validated JSON payloads via `Zod`. The platform relies on a structural retry loop (`_safeGenerate`) which feeds schema errors back to the model for self-correction.

## Security
- **Data Boundaries:** Fully separated Mongoose schemas with compound unique indexing prevent duplicate requests and enforce strict JWT ownership boundaries.
- **Prompt Injection:** User payloads are separated from the System Prompt. The model is forbidden from altering scores, and outputs are stripped of hallucinated JSON keys.

## Tech Stack
**Frontend:** React, Vite, Tailwind CSS
**Backend:** Node.js, Express
**Database:** MongoDB (Mongoose)
**Testing:** Jest, Supertest
**AI Integration:** @google/genai

## Local Setup
1. Clone the repository
2. Server setup: `cd server && npm install`
3. Client setup: `cd client && npm install`
4. Provide environment variables in `server/.env` using `server/.env.example` as a template.
5. Start backend: `cd server && npm run dev`
6. Start frontend: `cd client && npm run dev`

## Running Tests
To run the full suite across all phases:
```bash
cd server
npm test
```

## Production Build
```bash
cd client
npm run build
```
Or use the provided Docker integration: `docker compose up --build`.

## API Documentation
See [API.md](./API.md) for full endpoint specifications.

## Limitations
- AI output heavily depends on the reasoning capability of the configured model (Gemini-2.5-flash recommended).
- Full global dashboard UI across multiple versions remains partially segmented across horizontal tabs.

## Future Work
- Implement automated semantic skill clustering across the multi-JD pipeline.
- Migrate to WebSockets for real-time generative streaming in the UI.
