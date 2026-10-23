/**
 * Minimal structured JSON logger with key-based redaction.
 * Events are logged as { level, time, event, ...fields }. Values under sensitive
 * keys (passwords, tokens, secrets, document/resume text, contact details) are
 * replaced with "[REDACTED]" at any depth.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|api[-_]?key|resumeText|jobDescription|originalText|^text$|document|email|phone/i;
const MAX_DEPTH = 6;

function redact(value, depth = 0) {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[Truncated]';
  if (value instanceof Error) {
    return { name: value.name, message: value.message, code: value.code, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return out;
}

function createLogger({ level = 'info', write = (line) => process.stdout.write(`${line}\n`), base = {} } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  const log = (lvl) => (event, fields = {}) => {
    if (LEVELS[lvl] < threshold) return;
    const entry = { level: lvl, time: new Date().toISOString(), event, ...redact({ ...base, ...fields }) };
    write(JSON.stringify(entry));
  };

  return {
    level,
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    child: (extra) => createLogger({ level, write, base: { ...base, ...extra } }),
  };
}

module.exports = { createLogger, redact };
