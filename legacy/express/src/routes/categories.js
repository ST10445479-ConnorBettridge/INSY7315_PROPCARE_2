const express = require('express');
const { authenticate } = require('../middleware/auth');
const { q, URGENCIES, STATUSES, OPEN_STATUSES } = require('../db');

const router = express.Router();

router.use(authenticate);

// GET /api/categories
router.get('/categories', (req, res) => {
  const counts = q.countByCategory().all();
  const categories = q.allCategories().all().map((c) => ({
    id: c.id,
    name: c.name,
    count: (counts.find((x) => x.id === c.id) || {}).n || 0,
  }));
  res.status(200).json({ status: 'success', data: { categories } });
});

// GET /api/categories/:id - with request count
router.get('/categories/:id', (req, res) => {
  const cat = q.allCategories().all().find((c) => c.id === req.params.id);
  if (!cat) {
    return res.status(404).json({ status: 'error', statusCode: 404, message: 'Category not found' });
  }
  const n = q.countByCategory().all().find((c) => c.id === cat.id)?.n || 0;
  res.status(200).json({ status: 'success', data: { category: { ...cat, count: n } } });
});

// GET /api/statuses
router.get('/statuses', (req, res) => {
  res.status(200).json({ status: 'success', data: { statuses: STATUSES, openStatuses: OPEN_STATUSES } });
});

// GET /api/urgencies
router.get('/urgencies', (req, res) => {
  res.status(200).json({ status: 'success', data: { urgencies: URGENCIES } });
});

module.exports = router;