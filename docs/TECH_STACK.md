# Technology Stack

> Every technology the project actually uses, with the exact installed version, where it is used, why, and what the alternatives would change. Versions come from `server/package-lock.json`, `client/package-lock.json` and the installed `node_modules`, checked on 2026-10-20.

---

## 1. "Installed", "imported" and "exercised" are different claims

When you describe a stack in an interview, be precise about which of these three levels you mean:

| Level | Meaning | How to check |
|---|---|---|
| **Installed** | The package is in `package.json` or `package-lock.json` and in `node_modules`. | `npm ls <name>` |
| **Imported** | Some source file actually `require()`s or `import`s it. | Search the source (not `node_modules`) for the package name. |
| **Exercised at run time** | A real request or test path executes that code. | Tests or a real run that hits the code path. |

Examples from this repository:

- `jszip` is **installed** (a transitive dependency of `mammoth`) and **imported** only by fixture-generator scripts in `server/test/fixtures/`. The application never imports it directly.
- `canvas` is **installed** as an optional dependency of `pdfjs-dist` 3.x, but the PDF extractor deliberately stubs the browser canvas globals so pdf.js never loads it (`stubCanvasGlobals()` in `server/src/documents/extractors/pdf.js`).
- `@google/genai` and `openai` are **imported lazily**, only inside their adapter factory, and only **exercised** when AI is configured and a user requests an AI task. The local `server/.env` has no `AI_MODEL`, so in local development neither SDK runs.
- The legacy `@xenova/transformers` (embeddings), `natural`, `pdf-parse`, `google-auth-library` and `joi` are **no longer installed**; they were removed with the legacy backend.

---

## 2. Runtime and language

| Technology | Version | Role |
|---|---|---|
| **Node.js** | Pinned: 22.20.0 (`.nvmrc`; `engines` `>=22.20.0 <23`). Docker: `node:22-slim`. CI: reads `.nvmrc`. Local validation: portable Node 22.20.0 (the machine's default is still v20.14.0). | JavaScript runtime for the backend and the build tools |
| **npm** | 10.7.0 locally | Package manager; lockfile version 3 |
| **JavaScript** | Backend: CommonJS (`require`). Frontend: ES modules and JSX. | No TypeScript in the project |

**Node version caution (verified):** Vite 7.3.6 declares `node: ^20.19.0 || >=22.12.0`, and mongodb-memory-server 11.2.0 declares `node: >=20.19.0`. With the local Node 20.14.0, both print warnings ("Using NodeJS below 20.19.0"; "Vite requires Node.js version 20.19+ or 22.12+"), although the tests and the build still succeeded on 2026-10-20. Node 20 also reached the end of its upstream support window in April 2026 according to the Node.js release schedule. The project is therefore pinned to **Node 22.20.0** (`.nvmrc`, `engines`, CI, Docker); on 2026-10-23 the full backend suite (22 suites, 442 tests), the frontend build and the PDF extraction checks passed locally on 22.20.0 without these warnings. Linux CI has not run yet.

**Why JavaScript and not TypeScript?** The redesign plan recommended TypeScript (`BACKEND_REDESIGN_IMPLEMENTATION_PLAN.md`, decision D4), but the implementation stayed in JavaScript and enforces data shapes **at run time** with Zod contracts. Trade-off: run-time validation catches bad data from files and models, which static types cannot do, but you lose compile-time checking inside the code.

---

## 3. Backend dependencies (`server/package.json`)

### 3.1 Web framework and HTTP middleware

| Package | Installed | Where used | What it contributes | Trade-offs / alternatives |
|---|---|---|---|---|
| **express** | 4.22.3 | `src/app.js`, every router | HTTP server, routing, middleware chain | Mature and minimal. Fastify is faster and has built-in schema validation, but Express is the common MERN choice. Express 5 improves async error handling; this project uses its own `asyncHandler` instead. |
| **helmet** | 7.2.0 | `src/app.js` | Security headers: CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options` and others (verified in responses) | Mostly matters when serving HTML; still a cheap baseline for a JSON API. |
| **cors** | 2.8.5 | `src/app.js` | Allow-lists browser origins from `CORS_ORIGINS` or `CLIENT_URL` | CORS controls which websites' JavaScript may read responses. It is **not** authentication. |
| **compression** | 1.8.2 | `src/app.js` | gzip responses (analysis results can be large JSON) | Often done by a reverse proxy instead. |
| **express-rate-limit** | 7.5.1 | `src/api/middleware/rateLimit.js` | Per-IP limits with `RateLimit` (draft-7) headers; rejections go through the error envelope | In-memory store: resets on restart and is not shared across instances. A Redis store would be needed to scale out. |
| **multer** | 1.4.5-lts.2 | `src/api/middleware/upload.js` | Parses `multipart/form-data`. Configured with **memory storage**, so no temporary files; limits on file size, file count, fields and parts. | Busboy-based. Memory storage is simple and private, but every upload is held in RAM (bounded at 10 MB per file). |
| **dotenv** | 16.6.1 | `server/index.js`, `scripts/aiProviderSmoke.js` | Loads `server/.env` into `process.env` | Production should inject real environment variables instead of a file. |

### 3.2 Data, validation and security

| Package | Installed | Where used | What it contributes | Trade-offs / alternatives |
|---|---|---|---|---|
| **mongoose** | 8.24.4 (driver `mongodb` 6.20.0) | `src/infrastructure/db/*`, repositories | MongoDB connection, schemas, the password-hashing pre-save hook, indexes | The `result` field is `Mixed` (schema-less) on purpose: the Zod contract, not Mongoose, defines its shape. The native driver plus Zod alone would also work. |
| **zod** | 3.25.76, used through its **`zod/v4`** subpath | config, request schemas, all domain contracts, AI output schemas | Schema validation and parsing; `z.toJSONSchema()` generates the JSON Schema sent to AI providers | Joi and Yup are alternatives. Zod was chosen because it composes well and can emit JSON Schema. |
| **jsonwebtoken** | 9.0.2 | `src/application/auth/tokenService.js` | Signs and verifies HS256 JWTs (payload `{ id, email }`, default expiry `7d`) | Stateless sessions, but tokens cannot be revoked before they expire. |
| **bcryptjs** | 3.0.2 | `src/infrastructure/db/models/User.js`, `authService.js` | Password hashing (cost factor 10) and comparison, plus a timing-equaliser on unknown emails | Pure JavaScript, so no native build step, but slower than native `bcrypt`. Argon2 is the modern alternative. |

**Why validate at the API boundary?** A schema check converts untrusted input (request bodies, query strings, environment variables, model output) into known-good typed values *before* any business logic runs. Invalid input gets a precise `400` listing every bad field, unknown fields are rejected (stopping "mass assignment", such as a client sneaking `isAdmin: true` into a request), and downstream code can trust its inputs.

### 3.3 Document processing

| Package | Installed | Where used | What it contributes | Trade-offs / alternatives |
|---|---|---|---|---|
| **pdfjs-dist** (Mozilla PDF.js) | 3.11.174, legacy CommonJS build | `src/documents/extractors/pdf.js` | Reads PDF text items with x/y positions; the extractor rebuilds lines, detects possible multi-column layouts and reads link annotations | Version 3 is kept because newer majors are ES-module-only and this backend is CommonJS. `npm audit` flags versions up to 4.7.76 for arbitrary JavaScript execution from a malicious PDF; the extractor sets `isEvalSupported: false`, which is the documented mitigation, but upgrading is still advisable. `pdf-parse` (used by the legacy code) was replaced because it bundled a 2018 pdf.js. |
| **mammoth** | 1.13.0 | `src/documents/extractors/docx.js` | Converts DOCX to semantic HTML; the extractor maps `<p>`, `<h1-6>`, `<li>`, `<tr>` and `<a>` to lines with bullet, heading and link information | HTML output keeps structure (bullets and headings) that `extractRawText` would lose. It does not see page geometry. |

### 3.4 AI providers (optional)

| Package | Installed | Where used | What it contributes |
|---|---|---|---|
| **@google/genai** | 2.23.0 | `src/infrastructure/ai/geminiProvider.js` (lazy `require`) | Gemini `models.generateContent` with `systemInstruction`, `responseMimeType: application/json`, `responseJsonSchema`, `temperature: 0.2` and abort and timeout options |
| **openai** | 5.8.2 | `src/infrastructure/ai/openaiProvider.js` (lazy `require`) | Chat Completions with `response_format: { type: "json_schema", strict: true }`; SDK retries disabled (`maxRetries: 0`) so retry policy lives in one place |

Both sit behind a small **provider port**, an interface the application depends on: `{ name, model, generateJson(request) }`. A bounded retry wrapper (`createAiProvider.js`) and a hard timeout (`providerErrors.js`) apply to both. Adding another provider means writing one adapter. Details: [AI_INTEGRATION.md](AI_INTEGRATION.md).

### 3.5 Development and test dependencies

| Package | Installed | Use |
|---|---|---|
| **jest** | 29.7.0 | Test runner for all 22 suites (`server/test/foundation`) |
| **supertest** | 7.2.2 | Sends real HTTP requests to the in-process Express app (no open port needed) |
| **mongodb-memory-server** | 11.2.0 (cached `mongod` 8.2.6 binary) | Starts a throwaway MongoDB per test file, so tests never touch a developer database |
| **nodemon** | 3.1.14 | `npm run dev`: restarts the server when files change |

---

## 4. Frontend dependencies (`client/package.json`)

| Package | Installed | Where used | What it contributes | Trade-offs / alternatives |
|---|---|---|---|---|
| **react**, **react-dom** | 19.1.0 | everything in `client/src` | Component UI, hooks, `React.lazy` and `Suspense` for route-level code splitting | Vue and Svelte are alternatives; React is the "R" in MERN. |
| **react-router-dom** | 7.18.4 | `App.jsx`, pages | Client-side routing; protected routes; URL search params for the open results tab | TanStack Router is an alternative. |
| **axios** | 1.20.0 | `lib/api.js`, `AuthContext.jsx` | HTTP client with a global base URL and a response interceptor for 401s | `fetch` would also work; axios gives interceptors and `FormData` handling. |
| **tailwindcss** + **@tailwindcss/vite** | 4.1.11 | `index.css` (`@import "tailwindcss"`, `@theme` tokens), class names in JSX | Utility-first CSS with design tokens defined once | `tailwindcss` is listed under `dependencies`, although it is only needed at build time. |
| **lucide-react** | 0.525.0 | icons across pages | SVG icons as React components | |
| **react-dropzone** | 14.3.8 | `AnalysisPage.jsx` | Drag-and-drop file input with type (PDF/DOCX/TXT) and 10 MB checks **in the browser**; the server re-validates by content | Client-side checks are a convenience only; they are not security. |
| **react-hot-toast** | 2.5.2 | `main.jsx`, dashboard, interview prep | Toast notifications (bottom-centre) | |
| **vite** + **@vitejs/plugin-react** | 7.3.6 + 4.6.0 | build and dev server | Fast dev server with hot reload; production bundling. Build verified 2026-10-20: 1,748 modules, main bundle 299.22 kB (100.41 kB gzip), CSS 53.80 kB. | Declares `^20.19.0 \|\| >=22.12.0`; the project pins Node 22.20.0 (see section 2). |
| **eslint** (+ `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`) | 9.30.1 | `client/eslint.config.js` | Linting; `npm run lint` passed with 0 problems on 2026-10-20 | Not run in CI. |
| `@types/react`, `@types/react-dom` | 19.x | none at run time | Editor type hints only (the code is JavaScript) | |

---

## 5. Infrastructure and tooling

| Tool | Where | Status |
|---|---|---|
| **MongoDB** | External database (local `mongod` or a hosted service). Collections: `users`, `analyses`. | Used in development. Tests use the in-memory server. |
| **Docker** | Root `Dockerfile`: `node:22-slim`, `npm ci --omit=dev`, runs as user `node`, `HEALTHCHECK` on `/api/health/live` | **Never built here**; Docker is not installed on the development machine |
| **GitHub Actions** | `.github/workflows/ci.yml`: backend `npm ci` and `jest --runInBand` with `AI_PROVIDER=none`; frontend `npm ci` and `npm run build` | Configured, but **had not run** on the current code as of 2026-10-23, because it had not yet been pushed (see [DEPLOYMENT_AND_OPERATIONS.md](DEPLOYMENT_AND_OPERATIONS.md)) |
| **concurrently** | Root `package.json` dev dependency | `npm run dev` at the root starts the server and client together |
| **Google Fonts** | `client/index.html` (Inter, Plus Jakarta Sans) | A third-party request at page load; system fonts are used offline |

---

## 6. Deliberately *not* in the stack

| Not used | Why |
|---|---|
| An LLM inside the scoring path | Determinism, explainability, cost (see [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md#8-why-deterministic-analysis-is-separate-from-ai-generated-explanations)) |
| Embeddings or semantic similarity (Transformers.js) | Removed with the legacy code. The `semantic` match method still exists in the contract (`server/src/domain/contracts/match.js`) but **no code produces it**. |
| Redis, queues, microservices | No measured need; analysis runs in roughly 100 ms in-process (one measured run: 114.8 ms total, with resume parsing the slowest stage at about 51 ms) |
| OCR (Tesseract and similar) | Scanned PDFs are rejected with a clear message instead |
| Redux or another state library | Local state and one auth context are enough |
| Frontend test framework | **None.** There are no React component tests; frontend behaviour was checked with lint, build and browser QA scripts run outside the repository (historical reports). |

---

## 7. Dependency health snapshot (`npm audit`, run 2026-10-20, read-only)

| Package set | Production dependencies | Including dev tooling |
|---|---|---|
| `server` | 8 advisories: 2 critical, 3 high, 3 moderate | 41: 2 critical, 33 high, 6 moderate |
| `client` | 0 | 1 high (`source-map-js`, a build-time dependency; fix available) |

What the server's production advisories are, and how much they matter:

| Advisory chain | Practical exposure | Fix |
|---|---|---|
| `pdfjs-dist` ≤ 4.7.76: arbitrary JavaScript execution on opening a malicious PDF | Mitigated in code: the extractor passes `isEvalSupported: false`, the published workaround | Major upgrade (ESM-only versions); needs a code change |
| `canvas`, `@mapbox/node-pre-gyp`, `tar` (critical; path traversal during archive extraction) | These are optional install-time dependencies of `pdfjs-dist` 3.x. The application never loads `canvas`. The `tar` issues concern extracting malicious archives, which happens at install time, not at run time. | Comes with the `pdfjs-dist` upgrade |
| `proxy-addr` (critical; IP spoofing with IPv4-mapped IPv6 trust subnets) | Used by Express for `trust proxy`. This app uses a numeric hop count (`TRUST_PROXY`, default 0), not subnet strings. | Patched to 2.0.8 in the lockfile on 2026-10-23 (a non-breaking update) |
| `mammoth` → `argparse` → `sprintf-js` (moderate, DoS) | `argparse` serves mammoth's command-line tool, not the library API this app calls | Monitor upstream |

The dev-tool advisories (Jest's `micromatch`/`braces` chain, `nodemon`) affect developer machines and CI, not the deployed API. Earlier reports' "0 vulnerabilities" claims (2026-10-05, client) were true at the time; advisories change over time, so re-run `npm audit` before any release.
