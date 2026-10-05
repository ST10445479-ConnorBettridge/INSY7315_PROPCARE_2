/**
 * PropCare - seed CLI.
 *   npm run seed   -> seeds data/propcare.db
 *   DB_PATH=:memory: npm run seed  -> seeds an in-memory DB (for tooling)
 */
require('dotenv').config();
const { seedDatabase } = require('../src/db');

seedDatabase()
  .then(() => {
    console.log('[propcare] seed complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[propcare] seed failed:', err.message);
    process.exit(1);
  });