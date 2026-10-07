const jwt = require('jsonwebtoken');
const { AppError } = require('./errorHandler');
const logger = require('../utils/logger');
const { q } = require('../db');

const ISSUER = 'propcare';
const AUDIENCE = 'propcare-api';

const JWT_VERIFY_OPTIONS = {
  algorithms: ['HS256'],
  issuer: ISSUER,
  audience: AUDIENCE,
};

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Access denied. No token provided.', 401));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, JWT_VERIFY_OPTIONS);

    // A signed JWT can outlive the account it was issued for (deactivation,
    // deletion). Re-check the live account row on every request so a
    // deactivated user's existing token stops granting access immediately and
    // so role changes take effect without waiting for token expiry.
    const account = q.userByIdFull().get(decoded.id);
    if (!account) {
      return next(new AppError('User account no longer exists.', 403));
    }
    if (!account.active) {
      return next(new AppError('This account has been deactivated. Contact an administrator.', 403));
    }

    // Use the live database values for role and name but preserve the id.
    req.user = {
      id: account.id,
      email: account.email,
      role: account.role,
      name: account.name,
    };
    next();
  } catch (err) {
    logger.warn('Invalid JWT token attempt', {
      ip: req.ip,
      url: req.originalUrl,
    });

    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Token has expired. Please login again.', 401));
    }
    return next(new AppError('Invalid token. Access denied.', 401));
  }
};

/**
 * Restrict a route to one or more roles.
 * Usage: router.get('/users', authorize('admin'), handler)
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || roles.indexOf(req.user.role) === -1) {
      return next(new AppError('You do not have permission to perform this action.', 403));
    }
    next();
  };
};

module.exports = { authenticate, authorize, ISSUER, AUDIENCE };