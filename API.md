# API Documentation

## Base URL
`/api`

## Authentication
Most endpoints require a JWT token passed in the `Authorization` header as a Bearer token.
`Authorization: Bearer <token>`

---

## Auth Endpoints
### `POST /auth/register`
Creates a new user.
- **Body**: `{ "email": "test@test.com", "password": "password" }`
- **Response**: `{ "success": true, "token": "..." }`

### `POST /auth/login`
Authenticates a user.
- **Body**: `{ "email": "test@test.com", "password": "password" }`
- **Response**: `{ "success": true, "token": "..." }`

---

## Resume Upload & Analysis Endpoints
### `POST /upload`
Uploads and parses a resume file (PDF, DOCX, TXT).
- **Body**: `multipart/form-data` with `file` field.
- **Response**: `{ "success": true, "data": { "parsedText": "..." } }`

### `POST /analyze`
Analyzes a parsed resume against a job description using the AI Engine.
- **Body**: `{ "resumeText": "...", "jobDescription": "..." }`
- **Response**: `{ "success": true, "data": { "analysis": { "overallScore": 85, ... }, "resumeId": "..." } }`

---

## Career Intelligence Endpoints
All require authentication and belong to `career.js`.

### `GET /career/:resumeId/interview-prep`
### `POST /career/:resumeId/interview-prep`
Gets or generates custom interview preparation based on skill gaps.
- **Response**: `{ "success": true, "data": { "questions": [...] } }`

### `GET /career/:resumeId/learning-roadmap`
### `POST /career/:resumeId/learning-roadmap`
Gets or generates a learning roadmap based on missing skills.
- **Response**: `{ "success": true, "data": { "items": [...] } }`

### `GET /career/:resumeId/project-relevance`
### `POST /career/:resumeId/project-relevance`
Evaluates user projects against JD metrics.
- **Response**: `{ "success": true, "data": { "projects": [...] } }`

### `POST /career/job-sets/:setId/jobs`
Adds a JD to an analysis set for multi-JD aggregation.
- **Body**: `{ "title": "Dev", "company": "Tech", "description": "..." }`
- **Response**: `{ "success": true, "data": { "aggregatedInsights": { "recurringGaps": ... } } }`
