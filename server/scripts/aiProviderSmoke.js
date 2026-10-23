/**
 * Manual, opt-in smoke test against the REAL configured AI provider.
 *
 *   node scripts/aiProviderSmoke.js              # all tasks
 *   node scripts/aiProviderSmoke.js interview_prep
 *
 * It is never run by `npm test`. It needs AI_PROVIDER, the provider key and
 * AI_MODEL in server/.env, makes one model request per task, and sends only a
 * built-in sample resume and job description (no user data, no database).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { loadConfig } = require('../src/config/env');
const { createAiProvider } = require('../src/infrastructure/ai/createAiProvider');
const { createAnalysisRunner } = require('../src/application/analysis/runAnalysis');
const { createGroundedAiService } = require('../src/application/ai/groundedAiService');
const { AI_TASKS } = require('../src/domain/contracts/ai');

const RESUME = [
  'Sample Candidate', 'sample@example.com', '',
  'EXPERIENCE', 'Software Engineer, Example Systems', 'Jan 2023 - Present',
  '- Worked on backend APIs with Node.js for the payments team.',
  '- Built dashboards with React, improving page load time by 30%.', '',
  'EDUCATION', 'B.Tech in Computer Science, Example Institute of Technology', '2018 - 2022', '',
  'SKILLS', 'Node.js, React, PostgreSQL, Git',
].join('\n');
const JOB = [
  'Backend Engineer', '', 'Required Qualifications',
  '- Node.js is required.', '- React is required.', '- SQL is required.', '- Kubernetes is required.',
  '- 5+ years of professional experience is required.', '', 'Preferred Qualifications', '- AWS.',
].join('\n');

(async () => {
  const config = loadConfig();
  if (!config.ai.enabled) {
    console.log(`AI is disabled (${config.ai.disabledReason}). Set AI_PROVIDER, the provider API key and AI_MODEL in server/.env.`);
    process.exit(1);
  }
  const provider = createAiProvider(config.ai);
  console.log(`Provider: ${provider.name}  model: ${provider.model}`);

  const { result } = await createAnalysisRunner()({ resume: { text: RESUME }, job: { text: JOB } });
  const analysis = { _id: 'smoke', result, ai: {} };
  const service = createGroundedAiService({
    provider,
    analysisRepository: { findOwned: async () => analysis, saveAiResult: async () => true },
    limits: { maxOutputTokens: config.ai.maxOutputTokens },
  });

  const tasks = process.argv[2] ? [process.argv[2]] : AI_TASKS;
  for (const task of tasks) {
    const started = Date.now();
    const outcome = await service.runTask({ userId: 'smoke', analysisId: 'smoke', task, regenerate: true });
    console.log(`\n=== ${task}: ${outcome.status}${outcome.reason ? ` (${outcome.reason})` : ''}, dropped ${outcome.droppedItems}, ${Date.now() - started} ms`);
    if (outcome.output) console.log(JSON.stringify(outcome.output, null, 2));
  }
})().catch((err) => { console.error('Smoke test failed:', err.message); process.exit(1); });
