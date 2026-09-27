const request = require('supertest');
const app = require('../src/app');
const { notificationRepository } = require('../src/repositories/notification.repository');

const PASSWORD = 'PropCare123!';

async function login(email, password = PASSWORD) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  return res.body.data.token;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

// app.js already kicks off the seed on import; hitting any route awaits that
// seed promise, so this guarantees the demo data exists before we assert on it.
beforeAll(async () => {
  await request(app).get('/api/health');
});

describe('Regression - manager reject/approve actions', () => {
  it('lets a manager reject an under-review request', async () => {
    const token = await login('michael.jacobs@obsrealty.co.za');
    const res = await request(app)
      .post('/api/requests/REQ-1076/status')
      .set(auth(token))
      .send({ action: 'reject', text: 'Duplicate of an existing order.' });

    expect(res.status).toBe(200);
    expect(res.body.data.request.status).toBe('rejected');
  });

  it('lets a manager reassign a rejected request (no dead end)', async () => {
    const token = await login('michael.jacobs@obsrealty.co.za');
    const res = await request(app)
      .post('/api/requests/REQ-1076/assign')
      .set(auth(token))
      .send({ technicianId: 'T1', urgency: 'normal', note: 'Reassigned after rejection.' });

    expect(res.status).toBe(200);
    expect(res.body.data.request.status).toBe('assigned');
    expect(res.body.data.request.technicianName).toBe('Johan van der Merwe');
  });

  it('lets a manager approve a submitted request', async () => {
    const token = await login('michael.jacobs@obsrealty.co.za');
    const res = await request(app)
      .post('/api/requests/REQ-1046/status')
      .set(auth(token))
      .send({ action: 'approve' });

    expect(res.status).toBe(200);
    expect(res.body.data.request.status).toBe('closed');
  });

  it('still blocks a tenant from rejecting their own request', async () => {
    const token = await login('sarahwilliams@example.com');
    const res = await request(app)
      .post('/api/requests/REQ-1076/status')
      .set(auth(token))
      .send({ action: 'reject' });

    expect(res.status).toBe(400);
  });

  it('still blocks a technician from approving a request', async () => {
    const token = await login('johan.vdm@obsrealty.co.za');
    const res = await request(app)
      .post('/api/requests/REQ-1076/status')
      .set(auth(token))
      .send({ action: 'approve' });

    expect(res.status).toBe(400);
  });
});

describe('Regression - status list filter', () => {
  it('filters the list server-side by status', async () => {
    const token = await login('sarahwilliams@example.com');
    const res = await request(app)
      .get('/api/requests?status=closed')
      .set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data.requests.length).toBeGreaterThan(0);
    expect(res.body.data.requests.every((r) => r.status === 'closed')).toBe(true);
  });

  it('combines a status filter with a search term', async () => {
    const token = await login('sarahwilliams@example.com');
    const res = await request(app)
      .get('/api/requests?status=closed&q=bathroom')
      .set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data.requests.length).toBe(1);
    expect(res.body.data.requests.every((r) => r.status === 'closed' && /bathroom/i.test(r.title))).toBe(true);
  });
});

describe('Regression - seeded notifications go to the right users', () => {
  it('sends the REQ-1027 confirmation prompt to its tenant (U5)', () => {
    const titles = notificationRepository.findForUser('U5').map((n) => n.title);
    expect(titles.some((t) => t.indexOf('REQ-1027 (dishwasher) marked complete') !== -1)).toBe(true);
  });

  it('does not send the REQ-1027 confirmation prompt to Sarah (U1)', () => {
    const titles = notificationRepository.findForUser('U1').map((n) => n.title);
    expect(titles.some((t) => t.indexOf('REQ-1027 (dishwasher) marked complete') !== -1)).toBe(false);
  });

  it('sends the REQ-1027 completion notice to its technician (U13)', () => {
    const titles = notificationRepository.findForUser('U13').map((n) => n.title);
    expect(titles.some((t) => t.indexOf('Job REQ-1027 completed') !== -1)).toBe(true);
  });

  it('does not send the REQ-1027 completion notice to Johan (U9)', () => {
    const titles = notificationRepository.findForUser('U9').map((n) => n.title);
    expect(titles.some((t) => t.indexOf('Job REQ-1027 completed') !== -1)).toBe(false);
  });
});

describe('Regression - settings API', () => {
  it('requires a token', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });

  it('returns the stored settings to the admin', async () => {
    const token = await login('admin@obsrealty.co.za');
    const res = await request(app)
      .get('/api/settings')
      .set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data.settings.orgName).toBe('Obs Realty Group');
    expect(res.body.data.settings.notifyChannel).toBe('In-app push + email');
  });

  it('persists settings written by the admin', async () => {
    const token = await login('admin@obsrealty.co.za');
    const saved = await request(app)
      .put('/api/settings')
      .set(auth(token))
      .send({ orgName: 'Obs Realty Group', notifyChannel: 'Email only' });

    expect(saved.status).toBe(200);
    expect(saved.body.data.settings.orgName).toBe('Obs Realty Group');

    const reread = await request(app)
      .get('/api/settings')
      .set(auth(token));
    expect(reread.body.data.settings.orgName).toBe('Obs Realty Group');
    expect(reread.body.data.settings.notifyChannel).toBe('Email only');
  });

  it('rejects an unknown notification channel', async () => {
    const token = await login('admin@obsrealty.co.za');
    const res = await request(app)
      .put('/api/settings')
      .set(auth(token))
      .send({ orgName: 'Obs Realty Group', notifyChannel: 'Carrier pigeon' });

    expect(res.status).toBe(400);
  });

  it('denies settings access to a manager', async () => {
    const token = await login('michael.jacobs@obsrealty.co.za');
    const res = await request(app)
      .get('/api/settings')
      .set(auth(token));
    expect(res.status).toBe(403);

    const write = await request(app)
      .put('/api/settings')
      .set(auth(token))
      .send({ orgName: 'Nope Ltd', notifyChannel: 'Email only' });
    expect(write.status).toBe(403);
  });

  it('denies settings access to a tenant and a technician', async () => {
    const tenant = await login('sarahwilliams@example.com');
    const tech = await login('johan.vdm@obsrealty.co.za');

    expect((await request(app).get('/api/settings').set(auth(tenant))).status).toBe(403);
    expect((await request(app).get('/api/settings').set(auth(tech))).status).toBe(403);
  });
});
