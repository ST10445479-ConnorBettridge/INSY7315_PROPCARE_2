const crypto = require('node:crypto');

const MIN_SECRET_LENGTH = 32;
const BYTES = 32; // 64 hex characters, comfortably over the minimum.

/**
 * Resolve the JWT signing secret.
 *
 * An operator-supplied JWT_SECRET always wins. When it is absent we generate a
 * strong random one at boot instead of hard-failing, because the only supported
 * zero-configuration deploy target (Render's Free plan) has no way to prompt for
 * a value and no shell to read one out of later. That keeps "clone, deploy, done"
 * working with no secrets to invent, copy or paste.
 *
 * The trade-off is deliberate and safe: the secret lives only in memory, so every
 * redeploy, restart or spin-down rotates it and invalidates outstanding tokens.
 * For this application that is the desired outcome -- sessions do not outlive the
 * process that issued them -- and it is strictly stronger than committing a fixed
 * secret to the repository, which would let anyone who clones the repo mint
 * tokens for the live deployment.
 *
 * The value is never logged. Only the fact that one was generated is reported.
 *
 * @returns {{ secret: string, generated: boolean }} the resolved secret and
 *   whether it was generated rather than supplied.
 */
function resolveJwtSecret(env = process.env) {
  const configured = env.JWT_SECRET;

  // Render, Docker and most CI systems transmit an unset variable as "" or as
  // whitespace rather than omitting the key entirely, so treat a blank value
  // as "not supplied" instead of as a misconfiguration.
  if (typeof configured !== 'string' || configured.trim() === '') {
    return { secret: crypto.randomBytes(BYTES).toString('hex'), generated: true };
  }

  if (configured.length < MIN_SECRET_LENGTH) {
    // Supplied but too weak: refuse rather than silently ignoring the operator.
    const error = new Error(
      `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters long (received ${configured.length}).`
    );
    error.code = 'JWT_SECRET_TOO_WEAK';
    throw error;
  }

  // Returned verbatim rather than trimmed: the value is an opaque secret, so it
  // is not this function's place to rewrite what the operator supplied.
  return { secret: configured, generated: false };
}

module.exports = { resolveJwtSecret, MIN_SECRET_LENGTH };
