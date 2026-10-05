const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  createRequestValidation,
  assignValidation,
  commentValidation,
  rateValidation,
  statusActionValidation,
  requestIdParam,
  listRequestsValidation,
  photoUploadValidation,
} = require('../middleware/validate');
const { AppError } = require('../middleware/errorHandler');
const service = require('../services/requests');

const router = express.Router();

router.use(authenticate);

// GET /api/requests - role-scoped list with filters
router.get('/', listRequestsValidation, (req, res) => {
  let rows = service.listForUser(req.user);
  const { status, category, q: search } = req.query;

  if (status && status !== 'all') {
    rows = rows.filter((r) => r.status === status);
  }
  if (category && category !== 'all') {
    rows = rows.filter((r) => r.category === category);
  }
  if (search) {
    const term = String(search).toLowerCase();
    rows = rows.filter((r) =>
      [r.id, r.title, r.category_name, r.unit]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }

  res.status(200).json({
    status: 'success',
    data: { requests: service.listToDetail(rows) },
  });
});

// POST /api/requests - tenant creates a maintenance request
router.post('/', createRequestValidation, (req, res, next) => {
  try {
    if (req.user.role !== 'tenant') {
      return next(new AppError('Only tenants can submit maintenance requests.', 403));
    }
    const request = service.createRequest(req.user, req.body);
    res.status(201).json({
      status: 'success',
      message: 'Maintenance request submitted',
      data: { request },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/requests/:id - detail with history, comments, rating
router.get('/:id', requestIdParam, (req, res, next) => {
  try {
    const request = service.getDetail(req.user, req.params.id);
    res.status(200).json({ status: 'success', data: { request } });
  } catch (err) {
    next(err);
  }
});

// POST /api/requests/:id/status - state-machine transition
router.post('/:id/status', statusActionValidation, (req, res, next) => {
  try {
    const request = service.applyStatusAction(req.user, req.params.id, req.body.action, req.body.text);
    res.status(200).json({
      status: 'success',
      message: 'Request updated',
      data: { request },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/requests/:id/assign - manager assigns a technician
router.post('/:id/assign', assignValidation, (req, res, next) => {
  try {
    const request = service.assignRequest(
      req.user,
      req.params.id,
      req.body.technicianId,
      req.body.urgency,
      req.body.note
    );
    res.status(200).json({
      status: 'success',
      message: 'Technician assigned',
      data: { request },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/requests/:id/rate - tenant rates completed work
router.post('/:id/rate', rateValidation, (req, res, next) => {
  try {
    const request = service.rateRequest(req.user, req.params.id, req.body.stars);
    res.status(200).json({
      status: 'success',
      message: 'Rating recorded',
      data: { request },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/requests/:id/comments - conversation thread
router.post('/:id/comments', commentValidation, (req, res, next) => {
  try {
    const request = service.commentOnRequest(req.user, req.params.id, req.body.text);
    res.status(200).json({
      status: 'success',
      message: 'Comment added',
      data: { request },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/requests/:id/photos - upload and attach a real photo file
// (JSON body: { filename, mimeType, data }, data is base64 or a data: URI).
// This route gets its own larger body-size limit in src/app.js - the global
// JSON cap (32 KB) is intentionally tight for every other endpoint.
router.post('/:id/photos', photoUploadValidation, (req, res, next) => {
  try {
    const request = service.addPhoto(req.user, req.params.id, {
      filename: req.body.filename,
      mimeType: req.body.mimeType,
      data: req.body.data,
    });
    res.status(201).json({
      status: 'success',
      message: 'Photo uploaded',
      data: { request },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;