const { AiProviderError } = require('../../application/ai/aiProvider');

/**
 * Maps anything an AI SDK throws to an AiProviderError. Only the HTTP status
 * and the error class are inspected; provider messages are not copied, so keys
 * and request content cannot leak through an error.
 */
function toProviderError(err, { provider, aborted = false }) {
  if (err instanceof AiProviderError) return err;
  const status = Number(err && (err.status || err.statusCode)) || null;
  const name = (err && err.name) || '';
  const code = (err && err.code) || '';

  let kind;
  if (aborted || /Abort|Timeout/i.test(name) || code === 'ETIMEDOUT' || status === 408 || status === 504) kind = 'timeout';
  else if (status === 429) kind = 'rate_limited';
  else if (status === 401 || status === 403) kind = 'auth';
  else if (status >= 500) kind = 'unavailable';
  else if (status >= 400) kind = 'rejected';
  else kind = 'unavailable'; // network failure, DNS, connection reset: no HTTP status

  return new AiProviderError(kind, { provider, status, cause: err });
}

/**
 * Runs `call(signal)` with a hard deadline. The signal asks the SDK to cancel;
 * the race guarantees the caller is released even if the SDK ignores it.
 */
async function withTimeout(timeoutMs, provider, call) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AiProviderError('timeout', { provider }));
    }, timeoutMs);
  });
  try {
    return await Promise.race([call(controller.signal), deadline]);
  } catch (err) {
    throw toProviderError(err, { provider, aborted: controller.signal.aborted });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { toProviderError, withTimeout };
