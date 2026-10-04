const request = require('supertest');
const app = require('../src/app');

describe('SPA routing', () => {
  test('unknown path serves SPA shell (public/index.html)', async () => {
    const res = await request(app).get('/some/random/path');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.text).toMatch(/Sign in to PropCare|Welcome back/);
  });

  test('/data/seed-data.js is not exposed at web root', async () => {
    const res = await request(app).get('/data/seed-data.js');
    expect(res.statusCode).toBe(404);
  });
});
