const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticate, authorize } = require('../middleware/auth');
const {
  registerUserValidation,
  updateProfileValidation,
} = require('../middleware/validate');
const { db, q } = require('../db');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authenticate);

// GET /api/users - admin only
router.get('/', authorize('admin'), (req, res) => {
  const users = q.allUsers().all().map((u) => ({
    ...u,
    active: Boolean(u.active),
  }));
  res.status(200).json({
    status: 'success',
    data: { users },
  });
});

// POST /api/users - admin creates a new account
router.post('/', authorize('admin'), registerUserValidation, async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const existing = q.userByEmail().get(email);
    if (existing) {
      return next(new AppError('A user with this email already exists', 409));
    }
    const id = `U${100 + (q.allUsers().all().length + 1)}`;
    const hash = await bcrypt.hash(password, 10);
    db.prepare(
      'INSERT INTO users (id, name, email, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
    ).run(id, name, email, hash, role, new Date().toISOString());

    logger.info('User created by admin', { id, email, role });
    res.status(201).json({
      status: 'success',
      message: 'User created',
      data: { user: { id, name, email, role, active: true } },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/me - own profile (with units)
router.get('/me', (req, res, next) => {
  const row = q.userById().get(req.user.id);
  if (!row) {
    return next(new AppError('User not found', 404));
  }
  const units = q.unitsForUser().all(req.user.id).map((u) => ({
    name: u.name,
    propertyId: u.property_id,
    propertyName: u.property_name,
  }));
  res.status(200).json({ status: 'success', data: { user: { ...row, active: Boolean(row.active), units } } });
});

// PUT /api/users/me - update own profile
router.put('/me', updateProfileValidation, async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (email) {
      const taken = q.userByEmail().get(email);
      if (taken && taken.id !== req.user.id) {
        return next(new AppError('A user with this email already exists', 409));
      }
    }
    const current = q.userByIdFull().get(req.user.id);
    const newName = name || current.name;
    const newEmail = (email || current.email).toLowerCase();
    let hash = current.password_hash;
    if (password) {
      hash = await bcrypt.hash(password, 10);
    }
    db.prepare('UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?')
      .run(newName, newEmail, hash, req.user.id);
    logger.info('User updated profile', { id: req.user.id });
    res.status(200).json({
      status: 'success',
      message: 'Profile updated',
      data: { user: { id: req.user.id, name: newName, email: newEmail, role: current.role, active: Boolean(current.active) } },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id/status - admin activates / deactivates an account
router.put('/:id/status', authorize('admin'), (req, res, next) => {
  const active = req.body.active;
  if (typeof active !== 'boolean') {
    return next(new AppError('active must be a boolean', 400));
  }
  const row = q.userByIdFull().get(req.params.id);
  if (!row) {
    return next(new AppError('User not found', 404));
  }
  if (row.id === req.user.id) {
    return next(new AppError('You cannot deactivate your own account', 400));
  }
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
  logger.info('User status changed', { id: req.params.id, active });
  res.status(200).json({ status: 'success', message: active ? 'User activated' : 'User deactivated' });
});

module.exports = router;