const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { loginValidation } = require('../middleware/validate');
const { authenticate, ISSUER, AUDIENCE } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { q } = require('../db');
const logger = require('../utils/logger');

const router = express.Router();

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '2h',
      issuer: ISSUER,
      audience: AUDIENCE,
    }
  );
};

const withUnits = (user) => {
  const units = q.unitsForUser().all(user.id).map((u) => ({
    name: u.name,
    propertyId: u.property_id,
    propertyName: u.property_name,
  }));
  return { ...user, units };
};

router.post('/login', loginValidation, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const userRow = q.userByEmail().get(email);

    // Check for lockout first
    const attempt = q.getLoginAttempt().get(email) || { attempts: 0, locked_until: null };
    if (attempt.locked_until && new Date(attempt.locked_until) > new Date()) {
      return next(new AppError('Too many failed login attempts. Try again later.', 429));
    }

    if (!userRow) {
      await bcrypt.compare(password, await bcrypt.hash('propcare-dummy-token', 10));
      // Record failed attempt for unknown email too to slow enumeration.
      try { q.incrementLoginAttempt().run(email); } catch (e) { /* ignore */ }
      return next(new AppError('Invalid email or password', 401));
    }

    if (!userRow.active) {
      return next(new AppError('This account has been deactivated. Contact an administrator.', 403));
    }

    const isMatch = await bcrypt.compare(password, userRow.password_hash);
    if (!isMatch) {
      // Record a failed attempt and possibly lock the account when attempts
      // exceed 5 in succession.
      try {
        q.incrementLoginAttempt().run(userRow.email);
        const att = q.getLoginAttempt().get(userRow.email);
        if (att && att.attempts >= 5) {
          // Lock for 15 minutes
          const until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
          q.resetLoginAttempt().run(userRow.email);
          // Recreate with locked_until using prepared statement
          try {
            q.setLoginLock().run(userRow.email, 0, until);
          } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }
      return next(new AppError('Invalid email or password', 401));
    }

    const safeUser = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role,
      active: userRow.active,
      createdAt: userRow.created_at,
    };
    // Successful login: reset attempts for the email.
    try { q.resetLoginAttempt().run(userRow.email); } catch (e) { /* ignore */ }
    const token = generateToken(safeUser);

    logger.info('User logged in', { userId: userRow.id, email: userRow.email });
    res.status(200).json({
      status: 'success',
      message: 'Login successful',
      data: { user: withUnits(safeUser), token },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, (req, res, next) => {
  const row = q.userById().get(req.user.id);
  if (!row) {
    return next(new AppError('User no longer exists', 404));
  }
  res.status(200).json({ status: 'success', data: { user: withUnits(row) } });
});

router.post('/logout', authenticate, (req, res) => {
  logger.info('User logged out', { userId: req.user.id });
  res.status(200).json({ status: 'success', message: 'Logged out successfully' });
});

module.exports = router;