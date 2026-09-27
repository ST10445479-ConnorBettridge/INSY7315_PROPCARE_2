/**
 * PropCare - SQLite data layer.
 *
 * Uses the built-in `node:sqlite` module (Node >= 22.5).
 * The database file is created automatically on first run and seeded with
 * the Obs Realty Group demo dataset when it is empty.
 *
 * NOTE: `node:sqlite` is flagged experimental in Node 22/23, so the server
 * is started with `--experimental-sqlite` (see package.json scripts).
 */
const path = require('path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'propcare.db');

function resolveDbPath() {
  if (DB_PATH === ':memory:') return DB_PATH;
  return path.isAbsolute(DB_PATH) ? DB_PATH : path.join(__dirname, '..', DB_PATH);
}

const resolved = resolveDbPath();
if (resolved !== ':memory:') {
  // Make sure the parent directory exists so SQLite can create the file.
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
}

const db = new DatabaseSync(resolved);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('tenant','manager','technician','admin')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS properties (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  address    TEXT NOT NULL,
  area       TEXT NOT NULL,
  manager_id TEXT NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS units (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  name        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS technicians (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  skill   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
  id          TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  unit        TEXT NOT NULL,
  tenant_id   TEXT NOT NULL REFERENCES users(id),
  category    TEXT NOT NULL REFERENCES categories(id),
  title       TEXT NOT NULL,
  detail      TEXT NOT NULL,
  urgency     TEXT NOT NULL CHECK (urgency IN ('low','normal','high','urgent')),
  status      TEXT NOT NULL CHECK (status IN
    ('submitted','under-review','assigned','in-progress','on-hold','completed','closed','cancelled','rejected')),
  tech_id     TEXT REFERENCES technicians(id),
  created     TEXT NOT NULL,
  updated     TEXT NOT NULL,
  photos      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES requests(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  name       TEXT NOT NULL,
  role_label TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES requests(id),
  status     TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id),
  icon       TEXT NOT NULL,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ratings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE REFERENCES requests(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Real uploaded photo files (base64-encoded), replacing the old bare counter.
-- Stored in SQLite rather than on disk because Render's Free plan gives the
-- app no persistent disk either way (see README) - the database is already
-- the single source of ephemeral state, so this keeps the storage story
-- consistent instead of adding a second, differently-ephemeral place to lose
-- data on restart.
CREATE TABLE IF NOT EXISTS request_photos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  TEXT NOT NULL REFERENCES requests(id),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes  INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  data        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
`;

db.exec(SCHEMA);

/**
 * Secondary indexes.
 *
 * SQLite only indexes the implicit PRIMARY KEY / UNIQUE constraints, so every
 * foreign key and every column we filter or sort on needs an explicit index.
 * Without these the joins in q.requestById(), the per-tenant / per-manager
 * lookups and the notification feed all degrade to full table scans.
 */
const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_users_role            ON users(role);
CREATE INDEX IF NOT EXISTS idx_properties_manager    ON properties(manager_id);
CREATE INDEX IF NOT EXISTS idx_units_user            ON units(user_id);
CREATE INDEX IF NOT EXISTS idx_units_property        ON units(property_id);
CREATE INDEX IF NOT EXISTS idx_technicians_user      ON technicians(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_property     ON requests(property_id);
CREATE INDEX IF NOT EXISTS idx_requests_tenant       ON requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_requests_category     ON requests(category);
CREATE INDEX IF NOT EXISTS idx_requests_tech         ON requests(tech_id);
CREATE INDEX IF NOT EXISTS idx_requests_status       ON requests(status);
CREATE INDEX IF NOT EXISTS idx_comments_request     ON comments(request_id);
CREATE INDEX IF NOT EXISTS idx_history_request      ON history(request_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_ratings_request       ON ratings(request_id);
CREATE INDEX IF NOT EXISTS idx_request_photos_request ON request_photos(request_id);
`;

db.exec(INDEXES);

/** Reference collections treated as code constants (kept in sync with the UI). */
const URGENCIES = [
  { id: 'low', name: 'Low' },
  { id: 'normal', name: 'Normal' },
  { id: 'high', name: 'High' },
  { id: 'urgent', name: 'Urgent' },
];

const STATUSES = [
  { id: 'submitted', name: 'Submitted' },
  { id: 'under-review', name: 'Under review' },
  { id: 'assigned', name: 'Assigned' },
  { id: 'in-progress', name: 'In progress' },
  { id: 'on-hold', name: 'On hold' },
  { id: 'completed', name: 'Completed' },
  { id: 'closed', name: 'Closed' },
  { id: 'cancelled', name: 'Cancelled' },
  { id: 'rejected', name: 'Rejected' },
];

const OPEN_STATUSES = ['submitted', 'under-review', 'assigned', 'in-progress', 'on-hold'];

/* ------------------------------------------------------------------ */
/* Seed data                                                          */
/* ------------------------------------------------------------------ */

const seedDatabase = async () => {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM users').get();

  // The seed is intentionally idempotent. Never attempt to insert the
  // demo dataset again once the database already contains users.
  if (existing.n > 0) {
    return;
  }

const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');

  // Resolve the demo password.
  //
  // DEMO_PASSWORD is optional on purpose. Hard-failing here used to crash the
  // service on its very first boot, because a fresh Render disk has no database
  // yet and therefore always needs seeding -- so an operator who followed the
  // README and set only JWT_SECRET got a boot loop instead of a running app.
  //
  // When it is absent we generate a strong random password at seed time instead
  // of shipping a hardcoded default in the repository. The value is never
  // logged; it is written to a gitignored file beside the database so the
  // operator can read it back from the host's filesystem or shell.
  const configuredDemoPassword = process.env.DEMO_PASSWORD;
  const generatedDemoPassword = configuredDemoPassword
    ? null
    : crypto.randomBytes(18).toString('base64url');
  const demoPassword = configuredDemoPassword || generatedDemoPassword;
  const passwordHash = await bcrypt.hash(demoPassword, 12);

  const insertUser = db.prepare(
    'INSERT INTO users (id, name, email, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
  );
  const insertProperty = db.prepare(
    'INSERT INTO properties (id, name, address, area, manager_id) VALUES (?, ?, ?, ?, ?)'
  );
  const insertUnit = db.prepare(
    'INSERT INTO units (user_id, property_id, name) VALUES (?, ?, ?)'
  );
  const insertCategory = db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)');
  const insertTechnician = db.prepare('INSERT INTO technicians (id, user_id, skill) VALUES (?, ?, ?)');
  const insertRequest = db.prepare(
    `INSERT INTO requests (id, property_id, unit, tenant_id, category, title, detail, urgency, status, tech_id, created, updated, photos)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertComment = db.prepare(
    'INSERT INTO comments (request_id, user_id, name, role_label, text, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertHistory = db.prepare(
    'INSERT INTO history (request_id, status, created_at) VALUES (?, ?, ?)'
  );
  const insertNotification = db.prepare(
    'INSERT INTO notifications (user_id, icon, title, created_at, read) VALUES (?, ?, ?, ?, 0)'
  );
  const insertRating = db.prepare(
    'INSERT INTO ratings (request_id, user_id, stars, created_at) VALUES (?, ?, ?, ?)'
  );
  const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');

  const now = new Date().toISOString();

  const users = [
    ['U1', 'Sarah Williams', 'sarahwilliams@example.com', 'tenant'],
    ['U2', 'Michael Jacobs', 'michael.jacobs@obsrealty.co.za', 'manager'],
    ['U3', 'Ayesha Patel', 'ayesha.patel@obsrealty.co.za', 'manager'],
    ['U4', 'Thabo Nkosi', 'thabo.nkosi@example.com', 'tenant'],
    ['U5', 'Priya Naidoo', 'priya.naidoo@example.com', 'tenant'],
    ['U6', 'Zanele Dlamini', 'zanele.dlamini@example.com', 'tenant'],
    ['U7', 'Pieter Botha', 'pieter.botha@example.com', 'tenant'],
    ['U8', 'Aisha Khan', 'aisha.khan@example.com', 'tenant'],
    ['U9', 'Johan van der Merwe', 'johan.vdm@obsrealty.co.za', 'technician'],
    ['U10', 'Riaan Botha', 'riaan.botha@obsrealty.co.za', 'technician'],
    ['U11', 'Naledi Mokoena', 'naledi.mokoena@obsrealty.co.za', 'technician'],
    ['U12', 'David Pillay', 'david.pillay@obsrealty.co.za', 'technician'],
    ['U13', 'Mark Petersen', 'mark.petersen@obsrealty.co.za', 'technician'],
    ['U14', 'System Admin', 'admin@obsrealty.co.za', 'admin'],
  ];

  users.forEach(([id, name, email, role]) => {
    insertUser.run(id, name, email, passwordHash, role, now);
  });

  const properties = [
    ['P1', 'Oak Avenue Residences', '12 Oak Avenue', 'Claremont', 'U2'],
    ['P2', 'The Rondebosch Collection', '41 Main Road', 'Rondebosch', 'U2'],
    ['P3', 'Kenilworth Mews', '8 Doncaster Road', 'Kenilworth', 'U3'],
    ['P4', 'Observatory Lofts', '17 Lower Trill Rd', 'Observatory', 'U2'],
    ['P5', 'Bellville Grove', '5 Voortrekker Road', 'Bellville', 'U3'],
    ['P6', 'Century City Quays', '22 Rialto Road', 'Century City', 'U2'],
    ['P7', 'Durbanville House', '3 Wellington Road', 'Durbanville', 'U3'],
    ['P8', 'Milnerton Sands', '66 Beach Road', 'Milnerton', 'U2'],
    ['P9', 'Newlands Park', '9 Kildare Road', 'Newlands', 'U3'],
    ['P10', 'Mowbray Terraces', '28 Mowbray Road', 'Mowbray', 'U2'],
  ];
  properties.forEach(([id, name, address, area, managerId]) => {
    insertProperty.run(id, name, address, area, managerId);
  });

  const units = [
    ['U1', 'P1', 'Claremont Unit 3B'],
    ['U1', 'P1', 'Claremont Unit 1A'],
    ['U1', 'P6', 'Century City Unit 2A'],
    ['U1', 'P1', 'Claremont Unit 5A'],
    ['U4', 'P2', 'Rondebosch Unit 7'],
    ['U4', 'P4', 'Observatory Unit 12'],
    ['U5', 'P3', 'Kenilworth Unit 4'],
    ['U6', 'P5', 'Bellville Unit 9'],
    ['U6', 'P7', 'Durbanville Unit 3'],
    ['U7', 'P8', 'Milnerton Unit 11'],
    ['U7', 'P10', 'Mowbray Unit 6'],
    ['U8', 'P9', 'Newlands Unit 2'],
  ];
  units.forEach(([userId, propertyId, name]) => {
    insertUnit.run(userId, propertyId, name);
  });

  [
    ['plumbing', 'Plumbing'],
    ['electrical', 'Electrical'],
    ['hvac', 'Heating & cooling'],
    ['security', 'Security'],
    ['appliances', 'Appliances'],
  ].forEach(([id, name]) => insertCategory.run(id, name));

  [
    ['T1', 'U9', 'Plumbing'],
    ['T2', 'U10', 'Electrical'],
    ['T3', 'U11', 'Heating & cooling'],
    ['T4', 'U12', 'Security'],
    ['T5', 'U13', 'Appliances'],
  ].forEach(([id, userId, skill]) => insertTechnician.run(id, userId, skill));

  const requests = [
    ['REQ-1045', 'P1', 'Claremont Unit 3B', 'U1', 'plumbing', 'Kitchen sink leaking', 'Water is pooling under the kitchen sink and the cupboard base is becoming saturated. It has been leaking since yesterday morning.', 'high', 'in-progress', 'T1', '2026-08-08', '2026-08-14', 0],
    ['REQ-1046', 'P1', 'Claremont Unit 1A', 'U1', 'plumbing', 'Leaking tap in bathroom', 'The hot water tap in the main bathroom drips continuously and will not fully close.', 'normal', 'submitted', null, '2026-08-12', '2026-08-12', 0],
    ['REQ-1061', 'P6', 'Century City Unit 2A', 'U1', 'security', 'Pool pump making noise', 'The pool pump housing is vibrating loudly during operation and the access cover has come loose.', 'high', 'assigned', 'T4', '2026-08-10', '2026-08-14', 0],
    ['REQ-1076', 'P1', 'Claremont Unit 5A', 'U1', 'appliances', 'Oven not heating', 'The oven reaches temperature very slowly and then switches off mid-cycle.', 'normal', 'under-review', null, '2026-08-13', '2026-08-14', 0],
    ['REQ-1032', 'P2', 'Rondebosch Unit 7', 'U4', 'electrical', 'No power in living room', 'Two sockets and the light fitting in the living room have no power after the storm.', 'urgent', 'in-progress', 'T2', '2026-08-06', '2026-08-13', 0],
    ['REQ-1038', 'P4', 'Observatory Unit 12', 'U4', 'hvac', 'Air conditioner not cooling', 'The wall unit blows warm air even on the lowest temperature setting.', 'normal', 'on-hold', 'T3', '2026-08-07', '2026-08-12', 0],
    ['REQ-1027', 'P3', 'Kenilworth Unit 4', 'U5', 'appliances', 'Dishwasher not draining', 'The dishwasher completes a cycle but leaves water standing in the bottom.', 'low', 'completed', 'T5', '2026-08-02', '2026-08-09', 0],
    ['REQ-1015', 'P5', 'Bellville Unit 9', 'U6', 'plumbing', 'Toilet running continuously', 'The cistern keeps refilling and never stops. Please inspect the inlet valve.', 'normal', 'completed', 'T1', '2026-07-28', '2026-08-04', 0],
    ['REQ-1009', 'P8', 'Milnerton Unit 11', 'U7', 'security', 'Front gate lock sticking', 'The electronic gate opens but the manual lock is stiff and difficult to turn.', 'normal', 'closed', 'T4', '2026-07-20', '2026-07-29', 0],
    ['REQ-1019', 'P9', 'Newlands Unit 2', 'U8', 'electrical', 'Ceiling light flickering', 'The hallway light flickers constantly and occasionally goes dark for a few seconds.', 'low', 'closed', 'T2', '2026-07-22', '2026-07-30', 0],
    ['REQ-1079', 'P7', 'Durbanville Unit 3', 'U6', 'hvac', 'Geyser not heating', 'No hot water for the last two days. The geyser thermostat may need replacement.', 'urgent', 'submitted', null, '2026-08-14', '2026-08-14', 0],
    ['REQ-1078', 'P10', 'Mowbray Unit 6', 'U7', 'plumbing', 'Shower pressure very low', 'The shower has almost no pressure even with the tap fully open.', 'normal', 'under-review', null, '2026-08-13', '2026-08-14', 0],
  ];

  requests.forEach(([id, propId, unit, tenantId, category, title, detail, urgency, status, techId, created, updated, photos]) => {
    insertRequest.run(id, propId, unit, tenantId, category, title, detail, urgency, status, techId, created, updated, photos);
  });

  const comments = [
    ['REQ-1045', 'U1', 'Sarah Williams', 'Tenant', 'Reported the issue with photos of the leaking pipes.', '2026-08-08 09:15'],
    ['REQ-1045', 'U2', 'Michael Jacobs', 'Property Manager', 'Thanks Sarah. Assigned to Johan and prioritised as high.', '2026-08-08 11:02'],
    ['REQ-1045', 'U9', 'Johan van der Merwe', 'Technician', 'On site now. Replacing the flexi hose under the sink, then testing.', '2026-08-14 14:40'],
    ['REQ-1061', 'U1', 'Sarah Williams', 'Tenant', 'The noise is getting worse at night.', '2026-08-10 17:30'],
    ['REQ-1061', 'U2', 'Michael Jacobs', 'Property Manager', 'David will inspect the pump tomorrow morning.', '2026-08-11 08:10'],
    ['REQ-1032', 'U4', 'Thabo Nkosi', 'Tenant', 'Still no power after the storm last night.', '2026-08-06 20:45'],
    ['REQ-1032', 'U2', 'Michael Jacobs', 'Property Manager', 'Logged with Riaan as urgent - checking the distribution board.', '2026-08-07 07:30'],
  ];
  comments.forEach(([requestId, userId, name, roleLabel, text, createdAt]) => {
    insertComment.run(requestId, userId, name, roleLabel, text, createdAt);
  });

  const history = [
    ['REQ-1045', 'Submitted', '2026-08-08 09:15'],
    ['REQ-1045', 'Under review', '2026-08-08 10:00'],
    ['REQ-1045', 'Assigned', '2026-08-08 11:02'],
    ['REQ-1045', 'In progress', '2026-08-09 08:20'],
    ['REQ-1061', 'Submitted', '2026-08-10 17:30'],
    ['REQ-1061', 'Under review', '2026-08-11 08:10'],
    ['REQ-1061', 'Assigned', '2026-08-11 08:15'],
    ['REQ-1046', 'Submitted', '2026-08-12 09:00'],
    ['REQ-1076', 'Submitted', '2026-08-13 09:00'],
    ['REQ-1032', 'Submitted', '2026-08-06 20:45'],
    ['REQ-1032', 'Assigned', '2026-08-07 07:30'],
    ['REQ-1027', 'Submitted', '2026-08-02 09:00'],
    ['REQ-1027', 'Completed', '2026-08-09 10:00'],
    ['REQ-1009', 'Submitted', '2026-07-20 09:00'],
    ['REQ-1009', 'Closed', '2026-07-29 09:00'],
  ];
  history.forEach(([requestId, status, createdAt]) => {
    insertHistory.run(requestId, status, createdAt);
  });

  const notifications = [
    ['U1', '\uD83D\uDD14', 'Reminder: technician visit scheduled for REQ-1045 tomorrow.', '2026-08-13 16:00'],
    ['U5', '\u2705', 'REQ-1027 (dishwasher) marked complete - please confirm.', '2026-08-12 10:22'],
    ['U2', '\uD83D\uDD27', 'New request REQ-1078 awaiting review.', '2026-08-14 08:00'],
    ['U2', '\uD83D\uDD27', 'Johan van der Merwe started work on REQ-1045.', '2026-08-14 14:40'],
    ['U9', '\uD83D\uDD27', 'You have been assigned REQ-1045.', '2026-08-08 11:02'],
    ['U13', '\u2705', 'Job REQ-1027 completed - awaiting tenant confirmation.', '2026-08-09 10:00'],
    ['U14', '\uD83C\uDFE2', 'Inspection completed at Milnerton Sands Unit 11.', '2026-08-10 12:05'],
  ];
  notifications.forEach(([userId, icon, title, createdAt]) => {
    insertNotification.run(userId, icon, title, createdAt);
  });

  insertRating.run('REQ-1027', 'U5', 5, '2026-08-10 11:00');

  insertSetting.run('org_name', 'Obs Realty Group');
  insertSetting.run('notify_channel', 'In-app push + email');

  console.log(
    '[propcare] seeded database with ' +
      users.length +
      ' users, ' +
      properties.length +
      ' properties and ' +
      requests.length +
      ' requests.'
  );

  if (configuredDemoPassword) {
    console.log(
      '[propcare] demo accounts ready - password comes from DEMO_PASSWORD ' +
        `(${configuredDemoPassword.length} chars, not shown)`
    );
  } else {
    // Never write the generated password to stdout. Persist it beside the
    // database instead so the operator can retrieve it from the host shell.
    const credentialsPath = path.join(
      path.dirname(resolveDbPath()),
      'demo-credentials.txt'
    );
    try {
      fs.writeFileSync(
        credentialsPath,
        [
          'PropCare demo accounts',
          'Generated automatically because DEMO_PASSWORD was not set.',
          'Sign in with any of these emails using the password below:',
          '',
          '  Tenant          sarahwilliams@example.com',
          '  Property manager michael.jacobs@obsrealty.co.za',
          '  Technician      johan.vdm@obsrealty.co.za',
          '  Administrator   admin@obsrealty.co.za',
          '',
          'Password: ' + demoPassword,
          '',
          'Set DEMO_PASSWORD in the host environment and delete this file to',
          'choose your own password and reseed from a clean database.',
          ''
        ].join('\n'),
        { encoding: 'utf8', mode: 0o600 }
      );
      console.log(
        '[propcare] DEMO_PASSWORD not set - generated a random demo password.'
      );
      console.log(
        '[propcare] read it from: ' + credentialsPath +
          ' (not printed here by design)'
      );
    } catch (err) {
      console.log(
        '[propcare] DEMO_PASSWORD not set and the generated demo password ' +
          'could not be written to disk (' + err.message + '). Demo accounts ' +
          'were seeded but their password is now unrecoverable - delete the ' +
          'database and set DEMO_PASSWORD to reseed.'
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Queries                                                            */
/* ------------------------------------------------------------------ */

const q = {
  userById: () => db.prepare(`
    SELECT id, name, email, role, active, created_at FROM users WHERE id = ?
  `),
  userActiveFlag: () => db.prepare(`
    SELECT active FROM users WHERE id = ?
  `),
  userByIdFull: () => db.prepare(`
    SELECT * FROM users WHERE id = ?
  `),
  userByEmail: () => db.prepare(`
    SELECT * FROM users WHERE email = ?
  `),
  allUsers: () => db.prepare(`
    SELECT id, name, email, role, active, created_at FROM users ORDER BY name
  `),
  unitsForUser: () => db.prepare(`
    SELECT u.name, p.id AS property_id, p.name AS property_name
    FROM units u JOIN properties p ON p.id = u.property_id
    WHERE u.user_id = ?
  `),
  propertiesAll: () => db.prepare(`
    SELECT p.*, u.name AS manager_name FROM properties p
    JOIN users u ON u.id = p.manager_id ORDER BY p.name
  `),
  propertiesForManager: () => db.prepare(`
    SELECT p.*, u.name AS manager_name FROM properties p
    JOIN users u ON u.id = p.manager_id WHERE p.manager_id = ? ORDER BY p.name
  `),
  propertiesForRequests: () => db.prepare(`
    SELECT DISTINCT p.*, u.name AS manager_name FROM properties p
    JOIN users u ON u.id = p.manager_id
    JOIN requests r ON r.property_id = p.id
    WHERE r.tenant_id = ? ORDER BY p.name
  `),
  propertiesForTechnician: () => db.prepare(`
    SELECT DISTINCT p.*, u.name AS manager_name
    FROM properties p
    JOIN users u ON u.id = p.manager_id
    JOIN requests r ON r.property_id = p.id
    WHERE r.tech_id = ? ORDER BY p.name
  `),
  propertyById: () => db.prepare(`
    SELECT p.*, u.name AS manager_name FROM properties p
    JOIN users u ON u.id = p.manager_id WHERE p.id = ?
  `),
  allCategories: () => db.prepare(`
    SELECT id, name FROM categories ORDER BY name
  `),
  allTechnicians: () => db.prepare(`
    SELECT t.id, u.id AS user_id, u.name, u.email, t.skill
    FROM technicians t JOIN users u ON u.id = t.user_id ORDER BY u.name
  `),
  technicianById: () => db.prepare(`
    SELECT t.id, u.id AS user_id, u.name, u.email, t.skill
    FROM technicians t JOIN users u ON u.id = t.user_id WHERE t.id = ?
  `),
  technicianByUserId: () => db.prepare(`
    SELECT t.id, u.id AS user_id, u.name, u.email, t.skill
    FROM technicians t JOIN users u ON u.id = t.user_id WHERE u.id = ?
  `),
  requestById: () => db.prepare(`
    SELECT r.*, c.name AS category_name, u.name AS tenant_name, p.name AS property_name,
           tu.name AS technician_name, tech.skill AS technician_skill
    FROM requests r
    JOIN categories c ON c.id = r.category
    JOIN users u ON u.id = r.tenant_id
    JOIN properties p ON p.id = r.property_id
    LEFT JOIN technicians tech ON tech.id = r.tech_id
    LEFT JOIN users tu ON tu.id = tech.user_id
    WHERE r.id = ?
  `),
requestByTenant: () => db.prepare(`
    SELECT r.id, r.title, r.detail, r.category, r.urgency, r.status, r.unit, r.created,
           r.updated, r.photos, r.tech_id, c.name AS category_name, p.name AS property_name
    FROM requests r
    JOIN categories c ON c.id = r.category
    JOIN properties p ON p.id = r.property_id
    WHERE r.tenant_id = ? ORDER BY r.updated DESC
  `),
  requestIdsByTenant: () => db.prepare('SELECT id FROM requests WHERE tenant_id = ?'),
requestByTechnician: () => db.prepare(`
    SELECT r.id, r.title, r.detail, r.category, r.urgency, r.status, r.unit, r.created,
           r.updated, r.photos, r.tech_id, c.name AS category_name, p.name AS property_name
    FROM requests r
    JOIN categories c ON c.id = r.category
    JOIN properties p ON p.id = r.property_id
    WHERE r.tech_id = ? ORDER BY r.updated DESC
  `),
requestByManagerProps: () => db.prepare(`
    SELECT r.id, r.title, r.detail, r.category, r.urgency, r.status, r.unit, r.created,
           r.updated, r.photos, r.tech_id, c.name AS category_name, r.property_id, p.name AS property_name
    FROM requests r
    JOIN categories c ON c.id = r.category
    JOIN properties p ON p.id = r.property_id
    WHERE p.manager_id = ? ORDER BY r.updated DESC
  `),
  requestIdsByManagerProps: () => db.prepare(`
    SELECT r.id FROM requests r JOIN properties p ON p.id = r.property_id WHERE p.manager_id = ?
  `),
requestAll: () => db.prepare(`
    SELECT r.id, r.title, r.detail, r.category, r.urgency, r.status, r.unit, r.created,
           r.updated, r.photos, r.tech_id, c.name AS category_name, r.property_id, p.name AS property_name
    FROM requests r
    JOIN categories c ON c.id = r.category
    JOIN properties p ON p.id = r.property_id
    ORDER BY r.updated DESC
  `),
  requestIdsAll: () => db.prepare('SELECT id FROM requests'),
  insertRequest: () => db.prepare(`
    INSERT INTO requests (id, property_id, unit, tenant_id, category, title, detail, urgency, status, tech_id, created, updated, photos)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', NULL, ?, ?, 0)
  `),
  updateRequestStatus: () => db.prepare('UPDATE requests SET status = ?, updated = ? WHERE id = ?'),
  updateRequestAssign: () => db.prepare('UPDATE requests SET tech_id = ?, urgency = ?, status = ?, updated = ? WHERE id = ?'),
  incrementPhotos: () => db.prepare('UPDATE requests SET photos = photos + 1, updated = ? WHERE id = ?'),
  insertRequestPhoto: () => db.prepare(`
    INSERT INTO request_photos (request_id, uploaded_by, filename, mime_type, size_bytes, data, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  photosForRequest: () => db.prepare(`
    SELECT id, filename, mime_type, size_bytes, data, created_at
    FROM request_photos WHERE request_id = ? ORDER BY created_at ASC
  `),
  photoById: () => db.prepare(`
    SELECT id, request_id, filename, mime_type, size_bytes, data, created_at
    FROM request_photos WHERE id = ?
  `),
  commentsForRequest: () => db.prepare(`
    SELECT id, user_id, name, role_label, text, created_at FROM comments
    WHERE request_id = ? ORDER BY created_at ASC
  `),
  insertComment: () => db.prepare(
    'INSERT INTO comments (request_id, user_id, name, role_label, text, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ),
  historyForRequest: () => db.prepare(`
    SELECT status, created_at FROM history WHERE request_id = ? ORDER BY created_at ASC
  `),
  insertHistory: () => db.prepare(
    'INSERT INTO history (request_id, status, created_at) VALUES (?, ?, ?)'
  ),
  ratingForRequest: () => db.prepare(`
    SELECT stars FROM ratings WHERE request_id = ?
  `),
  insertRating: () => db.prepare(
    'INSERT INTO ratings (request_id, user_id, stars, created_at) VALUES (?, ?, ?, ?)'
  ),
  nextReqNumber: () => db.prepare(`
    SELECT COALESCE(
      CAST(REPLACE(MAX(id), 'REQ-', '') AS INTEGER),
      1079
    ) AS n FROM requests
  `),
  notificationsForUser: () => db.prepare(`
    SELECT id, icon, title, created_at, read FROM notifications
    WHERE user_id = ? ORDER BY created_at DESC
  `),
  insertNotification: () => db.prepare(
    'INSERT INTO notifications (user_id, icon, title, created_at, read) VALUES (?, ?, ?, ?, 0)'
  ),
  markNotificationsRead: () => db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0'),
  unreadCount: () => db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0'),
  countByCategory: () => db.prepare(`
    SELECT c.id, c.name, COUNT(r.id) AS n FROM categories c
    LEFT JOIN requests r ON r.category = c.id GROUP BY c.id ORDER BY n DESC
  `),
  countByStatus: () => db.prepare(`
    SELECT status, COUNT(*) AS n FROM requests GROUP BY status
  `),
  countByProperty: () => db.prepare(`
    SELECT p.id, p.name, COUNT(r.id) AS n FROM properties p
    LEFT JOIN requests r ON r.property_id = p.id GROUP BY p.id ORDER BY p.name
  `),
  countByPropertyForManager: () => db.prepare(`
    SELECT p.id, p.name, COUNT(r.id) AS n FROM properties p
    LEFT JOIN requests r ON r.property_id = p.id
    WHERE p.manager_id = ? GROUP BY p.id ORDER BY p.name
  `),
  tenantCount: () => db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'tenant'"),
  managerCount: () => db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'manager'"),
  technicianCount: () => db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'technician'"),
  adminCount: () => db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'"),
  propertyCount: () => db.prepare('SELECT COUNT(*) AS n FROM properties'),
  unitCount: () => db.prepare('SELECT COUNT(*) AS n FROM units'),
  settingByKey: () => db.prepare('SELECT key, value FROM settings WHERE key = ?'),
  upsertSetting: () => db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ),
};

module.exports = {
  db,
  q,
  URGENCIES,
  STATUSES,
  OPEN_STATUSES,
  seedDatabase,
};
