const request = require('supertest');
const app = require('../src/app');

const PASSWORD = 'PropCare123!';

async function login(email) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: PASSWORD });
  return res.body.data.token;
}

describe('Reports API - GET /api/reports/summary', () => {
  it('returns portfolio-scoped totals for a manager', async () => {
    const token = await login('michael.jacobs@obsrealty.co.za');


    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${token}`);


    expect(res.status).toBe(200);


    const s = res.body.data.summary;


    expect(s.total).toBe(8);
    expect(s.open).toBe(7);
    expect(s.resolved).toBe(1);


    expect(Array.isArray(s.byCategory)).toBe(true);
    expect(Array.isArray(s.byProperty)).toBe(true);
    expect(Array.isArray(s.byStatus)).toBe(true);


    expect(s.byProperty[0].count).toBe(3);
    expect(s.properties.length).toBe(6);


    const statusCounts = Object.fromEntries(
      s.byStatus.map((item) => [item.status, item.count])
    );


    expect(statusCounts['in-progress']).toBe(2);
    expect(statusCounts.submitted).toBe(1);
    expect(statusCounts['under-review']).toBe(2);
    expect(statusCounts.assigned).toBe(1);
    expect(statusCounts['on-hold']).toBe(1);
    expect(statusCounts.closed).toBe(1);
    expect(statusCounts.completed).toBeUndefined();

    // REQ-1027 (completed, Dishwasher) belongs to Ayesha's portfolio, so it
    // must not appear in Michael's status totals.
  });

  it('returns platform-wide totals for an admin', async () => {
    const token = await login('admin@obsrealty.co.za');
    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const s = res.body.data.summary;
    expect(s.total).toBe(12);
    expect(s.open).toBe(8);
    expect(s.resolved).toBe(4);
    expect(s.users.tenants).toBe(6);
    expect(s.users.managers).toBe(2);
    expect(s.users.technicians).toBe(5);
    expect(s.users.admins).toBe(1);
    expect(s.properties).toBe(10);
    expect(s.units).toBe(12);
  });

  it('denies reports to a tenant', async () => {
    const token = await login('sarahwilliams@example.com');
    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('denies reports to a technician', async () => {
    const token = await login('johan.vdm@obsrealty.co.za');
    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/reports/summary');
    expect(res.status).toBe(401);
  });
});

describe('Reference data API', () => {
  it('lists categories with request counts', async () => {
    const token = await login('sarahwilliams@example.com');
    const res = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const cats = res.body.data.categories;
    expect(cats.length).toBe(5);
    expect(cats.find((c) => c.id === 'plumbing').count).toBe(4);
  });

  it('returns a single category', async () => {
    const token = await login('sarahwilliams@example.com');
    const res = await request(app)
      .get('/api/categories/electrical')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.category.name).toBe('Electrical');
  });

  it('returns 404 for an unknown category', async () => {
    const token = await login('sarahwilliams@example.com');
    const res = await request(app)
      .get('/api/categories/gardening')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('lists statuses and open statuses', async () => {
    const token = await login('sarahwilliams@example.com');
    const res = await request(app)
      .get('/api/statuses')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.statuses.length).toBe(9);
    expect(res.body.data.openStatuses).toEqual(expect.arrayContaining(['submitted', 'assigned']));
  });

  it('lists urgencies', async () => {
    const token = await login('sarahwilliams@example.com');
    const res = await request(app)
      .get('/api/urgencies')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.urgencies.length).toBe(4);
  });
});

describe('Security headers', () => {
  it('sends X-Content-Type-Options nosniff on static assets', async () => {
    const res = await request(app).get('/css/styles.css');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('hides the x-powered-by header', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});