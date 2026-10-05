const express = require('express');
const { authenticate } = require('../middleware/auth');
const { q } = require('../db');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

router.use(authenticate);

// GET /api/properties - role-scoped list
router.get('/', (req, res) => {
  let rows;
  if (req.user.role === 'admin') {
    rows = q.propertiesAll().all();
  } else if (req.user.role === 'manager') {
    rows = q.propertiesForManager().all(req.user.id);
  } else if (req.user.role === 'tenant') {
    rows = q.propertiesForRequests().all(req.user.id);
  } else if (req.user.role === 'technician') {
    // Technician properties must come from requests assigned to
    // that technician, not from tenant ownership.
    rows = q.propertiesForTechnician().all(req.user.id);
  } else {
    rows = [];
  }
  const properties = rows.map((p) => ({
    id: p.id,
    name: p.name,
    address: p.address,
    area: p.area,
    managerId: p.manager_id,
    managerName: p.manager_name,
  }));
  res.status(200).json({ status: 'success', data: { properties } });
});

// GET /api/properties/:id - role-scoped detail with open request count
router.get('/:id', (req, res, next) => {
  const prop = q.propertyById().get(req.params.id);
  if (!prop) {
    return next(new AppError('Property not found', 404));
  }
  if (req.user.role === 'manager' && prop.manager_id !== req.user.id) {
    return next(new AppError('You do not have permission to view this property', 403));
  }
  if (['tenant', 'technician'].includes(req.user.role)) {
    return next(new AppError('You do not have permission to view this property', 403));
  }
  const openCount = q.countByProperty().all().find((p) => p.id === prop.id)?.n || 0;
  res.status(200).json({
    status: 'success',
    data: {
      property: {
        id: prop.id,
        name: prop.name,
        address: prop.address,
        area: prop.area,
        managerId: prop.manager_id,
        managerName: prop.manager_name,
        openRequests: openCount,
      },
    },
  });
});

module.exports = router;