const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { q } = require('../db');

const router = express.Router();

router.use(authenticate);

// GET /api/tenants - managers and admins can view tenants
router.get('/', authorize('manager', 'admin'), (req, res) => {
  const tenants = q
    .allUsers()
    .all()
    .filter((u) => u.role === 'tenant')
    .map((u) => {
      const units = q.unitsForUser().all(u.id).map((x) => x.name);
      const open = q.requestByTenant().all(u.id).filter((r) =>
        ['submitted', 'under-review', 'assigned', 'in-progress', 'on-hold'].includes(r.status)
      ).length;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        units,
        openRequests: open,
      };
    });
  res.status(200).json({ status: 'success', data: { tenants } });
});

module.exports = router;