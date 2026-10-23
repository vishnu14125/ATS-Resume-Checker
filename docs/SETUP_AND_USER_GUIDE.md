# Setup and User Guide

> **Part A** is for a developer starting from a clean checkout. **Part B** is for anyone using the application. Commands and labels match the current code (`package.json` scripts, `server/.env.example`, and the React components) as checked on 2026-10-20.

---

# Part A: Developer setup

## A1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | **22.20+ (below 23)** | Pinned in `.nvmrc` (22.20.0) and in the `engines` field of both `package.json` files. Vite 7.3.6 and mongodb-memory-server 11.2.0 alone would accept 20.19+, but the project standardises on Node 22, which is what the tests and build were validated on (2026-10-23). |
| npm | 10.x (ships with Node) | Lockfile version 3 |
| MongoDB | A server reachable at `MONGO_URI`: a local `mongod` or a hosted cluster | Required to *run* the app. **Not** required for the backend tests, which start their own in-memory MongoDB. |
| Git | any | Clone the repository |
| AI provider key (optional) | Gemini or OpenAI | Only for the Interview prep feature and the API-only AI tasks |

## A2. Install dependencies

From the repository root:

```bash
# Option 1: one command (root package.json "install-all")
npm run install-all

# Option 2: separately; use "npm ci" for the exact locked versions
npm ci --prefix server
npm ci --prefix client
npm install            # root only: installs "concurrently" for "npm run dev"
```

## A3. Configure the backend

```bash
cp server/.env.example server/.env
```

Then edit `server/.env`. At minimum:

- **`JWT_SECRET`**: required. Generate one with
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
  In production it must be at least 32 characters and must not be the example placeholder (the server refuses to start otherwise).
- **`MONGO_URI`**: optional in development (default `mongodb://127.0.0.1:27017/ats_resume_checker`), **required in production**.

Never commit `server/.env`; it is ignored by git.

## A4. Environment variables

All backend variables are validated at startup by `server/src/config/env.js`. Invalid values print a list of problems and exit with code 1.

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test` or `production`. In development, 500 errors include a `debug` block. |
| `PORT` | `5000` | API port |
| `LOG_LEVEL` | `info` (`silent` when `NODE_ENV=test`) | `debug`, `info`, `warn`, `error`, `silent` |
| `MONGO_URI` | dev: `mongodb://127.0.0.1:27017/ats_resume_checker` | Required in production |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | `10000` | Startup fails if MongoDB cannot be reached within this time |
| `JWT_SECRET` | none (**required**) | 32+ characters in production |
| `JWT_EXPIRES_IN` | `7d` | Any `jsonwebtoken` duration |
| `CLIENT_URL` | `http://localhost:5173` | The allowed CORS origin |
| `CORS_ORIGINS` | none | Comma-separated list; overrides `CLIENT_URL` |
| `TRUST_PROXY` | `0` (outside production) | Number of reverse proxies in front of the API. **Required in production**: the server refuses to start without an explicit value. Use `0` when the API is reached directly; a value higher than the real number of proxies lets clients bypass the per-IP rate limits. |
| `JSON_BODY_LIMIT` | `10mb` | Maximum JSON body size |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | 900000, 500 | Global `/api/*` limit per IP |
| `AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX` | 900000, 10 | Register and login |
| `ANALYSIS_RATE_LIMIT_WINDOW_MS`, `ANALYSIS_RATE_LIMIT_MAX` | 900000, 30 | `POST /analyses` |
| `AI_RATE_LIMIT_WINDOW_MS`, `AI_RATE_LIMIT_MAX` | 900000, 30 | `POST /analyses/:id/ai` |
| `AI_PROVIDER` | unset (AI off) | `gemini`, `openai` or `none` |
| `AI_MODEL` | none | **Required to enable AI.** Falls back to `GEMINI_MODEL` or `OPENAI_MODEL`. No built-in default. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | none | Used when `AI_PROVIDER=gemini` |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | none | Used when `AI_PROVIDER=openai` |
| `AI_TIMEOUT_MS` | `20000` | Per-call deadline |
| `AI_MAX_OUTPUT_TOKENS` | `4096` | |
| `AI_MAX_RETRIES` | `1` | 0 to 2, transient failures only |

Fixed limits (not configurable): uploads 10 MB (PDF and DOCX) and 1 MB (TXT), 15 PDF pages, 100,000 characters of resume text, 30,000 characters of job description.

**Frontend** (`client/.env`, read by Vite at build and dev time):

| Variable | Default in code | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:5000` | The API origin the browser calls |

> The local `server/.env` on the development machine also contains `GOOGLE_*`, `GROQ_API_KEY` and `ATS_V2_MODE`. These are leftovers from the removed legacy code; **nothing reads them**.

## A5. Start MongoDB

Use whatever you have. For example, a local `mongod`:

```bash
mongod --dbpath /path/to/your/db-folder
```

or set `MONGO_URI` to a hosted cluster (`mongodb+srv://…`).

## A6. Run the backend

```bash
cd server
npm run dev      # nodemon: restarts on changes
# or
npm start        # node index.js
```

Expected JSON log lines (abridged):

```json
{"level":"warn","event":"config.warning","message":"JWT_SECRET is shorter than 32 characters; this would be rejected in production"}
{"level":"warn","event":"config.warning","message":"AI_PROVIDER is \"gemini\" but no model is configured (set AI_MODEL). AI features are disabled."}
{"level":"info","event":"db.connected","host":"127.0.0.1:27017","durationMs":…}
{"level":"info","event":"server.started","port":5000,"env":"development"}
```

(The two warnings appear only if they apply to your configuration; the second is what the current local setup produces.)

## A7. Run the frontend

```bash
cd client
npm run dev      # Vite dev server, http://localhost:5173
```

Or start both from the repository root with `npm run dev` (uses `concurrently`).

## A8. Verify the setup

```bash
curl http://localhost:5000/api/health          # {"status":"OK",...}
curl http://localhost:5000/api/health/live     # {"success":true,"data":{"status":"live"}}
curl http://localhost:5000/api/health/ready    # database "up", or 503 NOT_READY
```

Then open `http://localhost:5173`, create an account and run an analysis.

## A9. Enable AI (optional)

1. Set `AI_PROVIDER=gemini` (or `openai`), the matching API key, and **`AI_MODEL=<a model id your key can access>`** in `server/.env`.
2. Restart the backend. The "no model is configured" warning should disappear.
3. Optional check against the real provider (costs one request per task and sends only a built-in fictional sample):

   ```bash
   cd server
   node scripts/aiProviderSmoke.js interview_prep
   ```

Without AI everything else works. The Interview prep tab shows "AI assistance is not available right now. Your analysis is unaffected." and its button is disabled.

## A10. Run the tests

```bash
cd server
NODE_OPTIONS="--max-old-space-size=4096" npx jest --runInBand
```

On Windows PowerShell:

```powershell
cd server; $env:NODE_OPTIONS="--max-old-space-size=4096"; npx jest --runInBand
```

No database and no API key are needed. Expect **22 suites, 442 tests** (result on 2026-10-23 with Node.js 22.20.0, about 160 s). The first run on a new machine downloads a MongoDB binary for mongodb-memory-server. Frontend checks:

```bash
cd client
npm run lint
npm run build    # outputs client/dist
```

## A11. Production-style run (local)

```bash
npm run build --prefix client                      # set VITE_API_BASE_URL first if the API is not on localhost:5000
NODE_ENV=production MONGO_URI=... JWT_SECRET=... npm start --prefix server
```

The server does not serve the frontend; host `client/dist` with any static server. See [DEPLOYMENT_AND_OPERATIONS.md](DEPLOYMENT_AND_OPERATIONS.md).

## A12. Ports and URLs

| Component | Default |
|---|---|
| API | `http://localhost:5000` |
| Frontend dev server | `http://localhost:5173` |
| MongoDB | `mongodb://127.0.0.1:27017/ats_resume_checker` |

## A13. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Invalid configuration: - JWT_SECRET: …` and exit code 1 | `JWT_SECRET` missing (or too short or a placeholder in production) | Set a long random secret |
| `db.connect_failed` and exit | MongoDB not running or wrong `MONGO_URI` | Start `mongod`, or fix the URI or the network allow-list |
| `EADDRINUSE :5000` | Another process uses the port | Stop it, or set `PORT` (and update `VITE_API_BASE_URL`) |
| Browser console shows a CORS error | The frontend origin is not allowed | Set `CLIENT_URL` or `CORS_ORIGINS` to the exact origin (scheme, host and port) |
| Every page sends you back to `/login` | The token is invalid or expired (the 401 interceptor logs you out) | Log in again; check that `JWT_SECRET` did not change between restarts |
| `429 Too many requests` while testing | Auth limit (10 per 15 min) reached | Wait, restart the server (limits are in memory), or raise `AUTH_RATE_LIMIT_MAX` in development |
| "AI assistance is not available right now" | `AI_MODEL` (or the key) not set, or the provider is busy | Section A9; retry later if the provider returned 503 or 429 |
| Upload rejected with "No selectable text was found…" | Scanned or image-only PDF | Export a text-based PDF or upload a DOCX |
| `Vite requires Node.js version 20.19+ or 22.12+` | Node older than Vite's minimum | Use Node 22.20+ (see `.nvmrc`) |
| `Using NodeJS below 20.19.0` during tests | Same, from mongodb-memory-server | Use Node 22.20+ (see `.nvmrc`); the tests still passed on 20.14 |
| `npm run build` exits with no output in Git Bash on Windows | Observed earlier on the development machine | Run it from PowerShell, or with `node node_modules/vite/bin/vite.js build` |
| Tests fail with `ENOENT … .pdf` on a fresh clone | The three PDF fixtures are missing from the checkout. `.gitignore` ignores `*.pdf` but has explicit exceptions for them, so they should be present | Check that `server/test/fixtures/**/*.pdf` are tracked (`git ls-files server/test/fixtures`) and that the `.gitignore` exceptions are intact |

---

# Part B: User guide

## B1. Create an account

1. Open the site and click **Get started** (top right) or **Analyze my resume**.
2. Enter your **Full name**, **Email address** and a **Password** of at least 8 characters, then click **Create account**.
3. You land on your dashboard, already signed in.

If the email is already registered you will see "An account with this email already exists." Use **Log in** instead.

## B2. Log in and log out

- **Log in:** click **Log in**, enter your email and password, then click **Log in**. A wrong email or password shows "Invalid email or password."
- **Log out:** click **Log out** in the header. Your session also ends automatically when your login token expires (after 7 days by default).

## B3. The dashboard

- **Your latest results** shows your most recent Resume Health score, your most recent Job Match score (if you have run one), and **What to improve next** with the number of suggested changes and how many are critical or high priority.
- **Recent analyses** lists your saved analyses, newest first: title, file name, type ("Resume analysis" or "Job analysis"), date, score rings and an eligibility badge when relevant. Click a row to open it.
- Only the **50 most recent** analyses are listed.

## B4. Analyse a resume without a job description

1. Click **Analyze your resume** (or **Analyze** in the header).
2. Step 1, **Add your resume**: drag a PDF, DOCX or TXT file (up to 10 MB) onto the box, click to **browse your files**, or paste your resume into **Paste the resume text**.
3. Leave step 2 (**Add a job description**) empty. The side panel shows **Resume analysis** as selected.
4. Click **Analyze my resume**. A progress bar shows "Reading and scoring your resume. This usually takes a few seconds."
5. Your report opens with three tabs: **Overview**, **How to improve** and **Resume Health**.

Tips for a readable resume: use a text-based (not scanned) file, standard headings (Experience, Education, Skills), one column, and give each role a title, an employer and dates.

## B5. Analyse a resume against a job

1. On the dashboard, click **Analyze for a job** (it opens the form with the job box focused), or use step 2 on the Analyze page.
2. Add your resume (step 1) and paste the job posting into **Add a job description** (up to 30,000 characters). Keep its line breaks and headings, such as "Requirements" and "Preferred"; a posting pasted as one long line yields no requirements.
3. The side panel switches to **Job match analysis**. Click **Analyze resume and job match**.
4. The report has five tabs: **Overview**, **Requirements**, **How to improve**, **Resume Health** and **Interview prep**.

## B6. Understanding Resume Health

- A score from 0 to 100 showing how readable, complete and well-evidenced your resume is **on its own** (it ignores the job). 80 and above reads "Healthy", 60 to 79 "Fair", below 60 "Needs work".
- **Overview** shows where the points came from: Parseability, Structure, Technical content, Impact and Completeness, each with points earned out of points available.
- The **Resume Health** tab lists the readability checks (pass, warning or fail, each with a "What to do" fix) and content findings by severity.
- If almost no text could be read, there is no score; the report explains why.
- It is **not** a prediction of interviews or offers, and visual design is not assessed (see "Limits of this report").

## B7. Understanding Job Match

- A score from 0 to 100 showing how strongly your resume's evidence meets **this job's explicit requirements**. 80 and above reads "Strong match", 60 to 79 "Moderate match", below 60 "Weak match".
- Required items count far more than preferred ones; preferred items are worth about a third as much, and items with no clear signal much less.
- A skill you only *list* earns slightly less than one you show in a role. A related skill (for example PostgreSQL for "SQL") earns partial credit.
- Items the resume cannot establish either way (for example years of experience when dates are missing) earn partial credit, not zero.

## B8. Reading requirements and evidence (Requirements tab)

Requirements are grouped as **Missing, required**; **Partially met**; **Matched**; **Missing, not required**; and **Not established or not scored**. Each shows the requirement, how important the job says it is (Required, Preferred or Contextual), why it was judged that way, and a "From your resume" quote when there is evidence.

"Not established" means the resume does not say either way. It is **not** the same as "missing". Responsibilities from the job posting appear as "This item is not scored in this analysis."

## B9. Understanding eligibility

The Overview shows one of:

- **No eligibility concerns**
- **Eligibility needs review**: a hard requirement (for example work authorisation) is not mentioned in your resume. This is not a failure and does not lower your score.
- **Likely filtered by a hard requirement**: your resume explicitly says you do not meet a critical requirement (such as a security clearance). Rewording cannot fix this; check whether the role is right for you.

Eligibility never changes the Job Match number.

## B10. Using the improvement plan (How to improve tab)

Recommendations are ordered from most to least important (Critical, High, Medium, Low). Each has the issue, **What to do**, **Why this matters**, and sometimes an amber note such as "Only add Java if it truthfully reflects your experience." Never add skills, dates or numbers that are not true.

After editing your resume, run a new analysis to see the effect; old reports are kept unchanged.

## B11. Interview preparation (needs AI)

1. Open a **job match** report and choose the **Interview prep** tab.
2. Click **Generate questions**. If AI is configured, you get revision topics and questions, each marked "Based on:" a job requirement or "Your resume".
3. **Regenerate** asks for a new set. Generated questions are saved with the report.

If the button is disabled and you see "AI assistance is not available right now. Your analysis is unaffected.", AI is not configured or the provider is busy; everything else works.

## B12. History and deletion

- Open any past report from **Recent analyses**. Reports are saved exactly as created.
- To delete one, click the trash icon on its row and confirm. Deletion is permanent and also removes its interview questions.

## B13. What needs AI, and what does not

| Feature | Needs AI? |
|---|---|
| Account, upload, analysis, both scores, requirements, evidence, eligibility, recommendations, history, deletion | **No** |
| Interview prep (Generate questions) | **Yes** (`AI_PROVIDER`, a key and `AI_MODEL` on the server) |

## B14. Common messages

| Message | Meaning | What to do |
|---|---|---|
| "Only PDF, DOCX and TXT files are supported." | Wrong file type (checked in the browser) | Convert the file |
| "That file is larger than 10 MB." | File too big | Compress it or remove images |
| "This file is named like a PDF but its content is not a valid PDF." | The file's contents do not match its extension | Export a real PDF |
| "No selectable text was found. This looks like a scanned or image-only PDF…" | No text layer | Use a text-based PDF or a DOCX |
| "This PDF is password protected…" | Encrypted PDF | Remove the password |
| "This PDF has N pages; the limit is 15." | Too long | Shorten it |
| "The resume is too long (limit: 100,000 characters)." | Too much text | Shorten it |
| "A resume is required…" | No file and no text | Add a resume |
| "Too many requests. Please try again later." | Rate limit reached | Wait a few minutes |
| "This analysis could not be loaded. It may have been deleted, or it may belong to another account." | Wrong or deleted report | Go back to the dashboard |
| "The analysis could not be completed. Please check your connection and try again." | Network or server problem | Retry; check that the API is running |
