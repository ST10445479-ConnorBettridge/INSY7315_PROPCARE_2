require('dotenv').config();
const logger = require('./src/utils/logger');
const { resolveJwtSecret } = require('./src/utils/secret');

// Resolve the signing secret before the module graph is loaded, because
// src/routes/auth.js reads process.env.JWT_SECRET at request time and needs the
// final value to already be in place.
let jwtSecretGenerated = false;
try {
  const resolved = resolveJwtSecret();
  process.env.JWT_SECRET = resolved.secret;
  jwtSecretGenerated = resolved.generated;
  if (resolved.generated) {
    logger.warn(
      'JWT_SECRET was not set, so a random one was generated for this process. ' +
        'Sessions are invalidated whenever the service restarts, redeploys or spins down. ' +
        'Set JWT_SECRET in the host environment to keep sessions across restarts.'
    );
  }
} catch (error) {
  logger.error(`${error.message} See .env.example.`);
  process.exit(1);
}

const app = require('./src/app');

const PORT = process.env.PORT || 8124;

const server = app.listen(PORT, () => {
  logger.info('PropCare server started', {
    url: `http://localhost:${PORT}`,
    env: process.env.NODE_ENV || 'development',
    jwtSecretSource: jwtSecretGenerated ? 'generated-at-boot' : 'configured',
  });
});

// Graceful shutdown for hosting platforms.
const shutdown = (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));