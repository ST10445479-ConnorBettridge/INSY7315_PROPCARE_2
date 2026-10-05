const { resolveJwtSecret, MIN_SECRET_LENGTH } = require('../src/utils/secret');

/**
 * The signing secret is what allows the app to run on Render's Free plan with
 * no configuration step at all: that plan cannot prompt for a value and offers
 * no shell to read one out of, so an absent JWT_SECRET must degrade to a safe
 * random secret rather than crash-looping the service. These tests pin both
 * halves of that contract, so it can never silently regress into either a boot
 * failure or a hardcoded secret in the repository.
 */
describe('JWT secret resolution', () => {
  it('generates a 64-character hex secret when none is configured', () => {
    const { secret, generated } = resolveJwtSecret({});

    expect(generated).toBe(true);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(secret.length).toBeGreaterThanOrEqual(MIN_SECRET_LENGTH);
  });

  it('generates a different secret on every call', () => {
    const first = resolveJwtSecret({}).secret;
    const second = resolveJwtSecret({}).secret;

    expect(first).not.toBe(second);
  });

  it('never generates a predictable value from a fixed input', () => {
    // Guards against someone "simplifying" this to a hash of a constant.
    const secrets = new Set(
      Array.from({ length: 25 }, () => resolveJwtSecret({}).secret)
    );

    expect(secrets.size).toBe(25);
  });

  it('uses a supplied secret instead of generating one', () => {
    const supplied = 'a'.repeat(MIN_SECRET_LENGTH);
    const { secret, generated } = resolveJwtSecret({ JWT_SECRET: supplied });

    expect(secret).toBe(supplied);
    expect(generated).toBe(false);
  });

  it('accepts a secret longer than the minimum', () => {
    const supplied = 'b'.repeat(MIN_SECRET_LENGTH + 16);

    expect(resolveJwtSecret({ JWT_SECRET: supplied }).generated).toBe(false);
  });

  it('rejects a supplied secret that is too weak rather than ignoring it', () => {
    // Silently replacing an operator's weak secret would hide a real
    // misconfiguration from them, so this stays a hard failure.
    expect(() => resolveJwtSecret({ JWT_SECRET: 'short' })).toThrow(
      /at least 32 characters/
    );

    try {
      resolveJwtSecret({ JWT_SECRET: 'x'.repeat(MIN_SECRET_LENGTH - 1) });
      throw new Error('expected a throw');
    } catch (error) {
      expect(error.code).toBe('JWT_SECRET_TOO_WEAK');
    }
  });

  it('treats an empty string as absent', () => {
    // Render and most CI systems transmit unset values as "" rather than
    // omitting them, so an empty value must not be treated as a weak secret.
    expect(resolveJwtSecret({ JWT_SECRET: '' }).generated).toBe(true);
  });

  it('does not treat a whitespace-only value as configured', () => {
    expect(resolveJwtSecret({ JWT_SECRET: '   ' }).generated).toBe(true);
  });
});
