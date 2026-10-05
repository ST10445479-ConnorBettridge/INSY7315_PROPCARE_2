// Test-only environment: in-memory SQLite + fixed JWT secret so the suite
// runs without a .env file or an on-disk database.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-32-chars-minimum-length!';
process.env.DB_PATH = ':memory:';
process.env.DEMO_PASSWORD = 'PropCare123!';
process.env.LOG_LEVEL = 'silent';

module.exports = {};