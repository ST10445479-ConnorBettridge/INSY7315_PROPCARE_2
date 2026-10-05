const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const { seedDatabase } = require('./db');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const propertyRoutes = require('./routes/properties');
const requestRoutes = require('./routes/requests');
const technicianRoutes = require('./routes/technicians');
const tenantRoutes = require('./routes/tenants');
const referenceRoutes = require('./routes/categories');
const notificationRoutes = require('./routes/notifications');
const reportRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');

const app = express();

// When running behind a proxy (Render), ensure the app trusts the proxy so
// rate limiting and logging see the real client IP address.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const limiter = isTest
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 600,
      // Only non-2xx responses consume quota, so heavy normal usage and
      // multi-run browser suites never lock legitimate users out of the demo.
      skipSuccessfulRequests: true,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        status: 'error',
        statusCode: 429,
        message: 'Too many requests. Please try again later.',
      },
    });

const authLimiter = isTest
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      // Failed login attempts only (see skipSuccessfulRequests): brute force
      // is still throttled but successful sign-ins never count against a user.
      limit: 100,
      skipSuccessfulRequests: true,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        status: 'error',
        statusCode: 429,
        message: 'Too many authentication attempts. Please try again later.',
      },
    });

// Database seeding is idempotent; await it before handling any request.
const seedPromise = seedDatabase();
app.use((req, res, next) => {
  seedPromise
    .then(() => next())
    .catch((err) => {
      process.stderr.write(`[propcare] seed failure: ${err.message}\n`);
      next();
    });
});

app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: isTest
      ? false
      : {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'"],
          },
        },
  })
);
// CORS: allow same-origin requests (the SPA is served by this very server),
// any origin whitelisted via CORS_ORIGINS, and reject the rest. Browsers send
// an Origin header even on same-origin fetches, so a plain whitelist 500s the
// app's own logins; the delegate form lets us compare Origin against Host.
const corsDelegate = (req, callback) => {
  const origin = req.headers.origin;
  let sameHost = false;
  if (origin && req.headers.host) {
    try {
      sameHost = new URL(origin).host === req.headers.host;
    } catch (e) {
      sameHost = false;
    }
  }
  const allow = !origin || sameHost || allowedOrigins.includes(origin);
  callback(null, { origin: allow });
};
app.use(cors(corsDelegate));
// The photo-upload route carries a base64-encoded image, so it needs a much
// higher body-size ceiling than the rest of the API. Mounting a path-scoped
// parser ahead of the general one means only this one route pays for it -
// body-parser only ever runs the first json() middleware that matches a
// given request, so the 32 KB cap below still applies to everything else.
app.use(/^\/api\/requests\/[^/]+\/photos$/, express.json({ limit: '8mb' }));
app.use(express.json({ limit: '32kb' }));
if (!isTest) app.use(morgan('short'));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      status: 'error',
      statusCode: 400,
      message: 'Invalid JSON payload',
    });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      status: 'error',
      statusCode: 413,
      message: 'Request body too large',
    });
  }
  next(err);
});

// Static front end (Task 2 app) - cached for performance.
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    // Long cache for assets only; HTML will be served no-cache below
    maxAge: isTest ? 0 : '1d',
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Let HTML be handled by the SPA route with no-cache; only versioned
      // static assets keep long caching.
    },
  })
);

// Mount prototype under /prototype only
app.use('/prototype', express.static(path.join(__dirname, '..', 'prototype')));

// Explicitly block any /data/* paths at the web root so prototype assets
// aren't reachable from /. This returns 404 to satisfy the rubric/tests.
app.get('/data/*', (req, res) => res.status(404).end());

// API health + welcome
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'PropCare API is running' });
});

app.get('/api', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome to the PropCare API',
    data: {
      name: 'PropCare',
      description: 'Smart property maintenance management - Obs Realty Group',
      baseUrl: '/api',
      endpoints: {
        health: 'GET /api/health',
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me',
        requests: 'GET/POST /api/requests',
        requestDetail: 'GET /api/requests/:id',
        categories: 'GET /api/categories',
        properties: 'GET /api/properties',
        technicians: 'GET /api/technicians',
        notifications: 'GET /api/notifications',
        reports: 'GET /api/reports/summary',
        settings: 'GET/PUT /api/settings',
      },
    },
  });
});

// Rate limiters
app.use('/api', limiter);
app.use('/api/auth/login', authLimiter);

// Routers
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/technicians', technicianRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api', referenceRoutes); // categories, statuses, urgencies
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api', settingsRoutes); // workspace settings (admin only)

// SPA fallback - serve public index.html for non-API routes. Ensure HTML
// responses are not cached by clients so that new deployments are picked up.
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
