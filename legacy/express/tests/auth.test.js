const request = require('supertest');
const app = require('../src/app');

const PASSWORD = 'PropCare123!';

async function login(email) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: PASSWORD });
  return res.body.data.token;
}

describe('Auth API - POST /api/auth/login', () => {
  it('logs in a tenant successfully', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'sarahwilliams@example.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe('sarahwilliams@example.com');
    expect(res.body.data.user.role).toBe('tenant');
    expect(res.body.data.user).not.toHaveProperty('password_hash');
    expect(res.body.data.user).not.toHaveProperty('password');
    expect(Array.isArray(res.body.data.user.units)).toBe(true);
  });

  it('logs in manager, technician and admin', async () => {
    const cases = [
      ['michael.jacobs@obsrealty.co.za', 'manager'],
      ['johan.vdm@obsrealty.co.za', 'technician'],
      ['admin@obsrealty.co.za', 'admin'],
    ];
    for (const [email, role] of cases) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe(role);
    }
  });

  it('rejects a wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'sarahwilliams@example.com', password: 'WrongPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('Invalid');
  });

  it('rejects an unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Invalid');
  });

  it('rejects a missing password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'sarahwilliams@example.com', password: '' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Password');
  });

  it('rejects an invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: PASSWORD });

    expect(res.status).toBe(400);
  });
});

describe('Auth API - GET /api/auth/me', () => {
  it('rejects access without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toContain('No token');
  });

  it('rejects an invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.valid.token');
    expect(res.status).toBe(401);
  });

  it('rejects a token signed for a different audience', async () => {
    const jwt = require('jsonwebtoken');
    const foreign = jwt.sign(
      { id: 'U1', email: 'sarahwilliams@example.com', role: 'tenant' },
      process.env.JWT_SECRET,
      { issuer: 'propcare', audience: 'some-other-api' }
    );
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${foreign}`);
    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid token', async () => {
    const token = await login('sarahwilliams@example.com');
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('sarahwilliams@example.com');
    expect(res.body.data.user.units.length).toBeGreaterThan(0);
  });
});

describe('Auth API - POST /api/auth/logout', () => {
  it('returns success for a valid token', async () => {
    const token = await login('sarahwilliams@example.com');
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });
});

describe('API basics', () => {
  it('exposes a health endpoint', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.message).toBe('PropCare API is running');
  });

  it('exposes an API welcome payload', async () => {
    const res = await request(app).get('/api');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.endpoints.login).toBe('POST /api/auth/login');
  });

  it('serves the SPA at the root route', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('returns 404 JSON for unknown API routes when authenticated', async () => {
    // Unknown routes under /api sit behind router-level authentication, so a
    // valid token is required before the 404 handler runs.
    const token = await login('sarahwilliams@example.com');
    const res = await request(app)
      .get('/api/does-not-exist')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
  });

  it('returns 400 for malformed JSON bodies', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{broken json');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid JSON');
  });
});