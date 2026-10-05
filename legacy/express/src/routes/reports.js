const express = require('express');
const { authenticate } = require('../middleware/auth');
const { q } = require('../db');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

router.use(authenticate);

const OPEN_STATUSES = [
  'submitted',
  'under-review',
  'assigned',
  'in-progress',
  'on-hold',
];

const RESOLVED_STATUSES = [
  'closed',
  'completed',
];

function buildSummary(scopeRows) {
  const stats = {
    total: 0,
    open: 0,
    resolved: 0,
    byCategory: [],
    byProperty: [],
    byStatus: [],
  };


  if (!scopeRows) return stats;


  const by = (keyFn, nameFn) => {
    const map = new Map();


    scopeRows.forEach((r) => {
      const key = keyFn(r);


      if (!map.has(key)) {
        map.set(key, {
          name: nameFn(r),
          count: 0,
        });
      }


      map.get(key).count += 1;
    });


    return Array.from(map.values())
      .sort((a, b) => b.count - a.count);
  };


  const statusMap = new Map();


  scopeRows.forEach((r) => {
    stats.total += 1;


    if (OPEN_STATUSES.includes(r.status)) {
      stats.open += 1;
    } else if (RESOLVED_STATUSES.includes(r.status)) {
      stats.resolved += 1;
    }


    statusMap.set(
      r.status,
      (statusMap.get(r.status) || 0) + 1
    );
  });


  stats.byStatus = Array.from(statusMap.entries())
    .map(([status, count]) => ({
      status,
      count,
    }))
    .sort((a, b) => b.count - a.count);


  stats.byCategory = by(
    (r) => r.category,
    (r) => r.category_name
  );


  stats.byProperty = by(
    (r) => r.property_id,
    (r) => r.property_name
  );


  return stats;
}


// GET /api/reports/summary
// Manager: stats scoped to their portfolio.
// Admin: platform-wide stats.
router.get('/summary', (req, res, next) => {
  try {
    if (req.user.role === 'admin') {
      const all = q.requestAll().all();
      const summary = buildSummary(all);


      summary.users = {
        tenants: q.tenantCount().get().n,
        managers: q.managerCount().get().n,
        technicians: q.technicianCount().get().n,
        admins: q.adminCount().get().n,
      };


      summary.properties = q.propertyCount().get().n;
      summary.units = q.unitCount().get().n;


      return res.status(200).json({
        status: 'success',
        data: { summary },
      });
    }


    if (req.user.role === 'manager') {
      const rows = q.requestByManagerProps().all(req.user.id);
      const summary = buildSummary(rows);


      summary.properties = q.countByPropertyForManager()
        .all(req.user.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          count: p.n,
        }));


      return res.status(200).json({
        status: 'success',
        data: { summary },
      });
    }


    return next(
      new AppError(
        'Only managers and administrators can view reports.',
        403
      )
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;