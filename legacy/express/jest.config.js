const path = require('path');

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',

  testMatch: [
    '**/tests/**/*.test.js',
  ],


  setupFilesAfterEnv: [
    path.resolve(__dirname, 'tests/setup-env.js'),
  ],


  clearMocks: true,


  testTimeout: 30000,
};