const express = require('express');
const { authenticate } = require('../middleware/auth');
const { notificationRepository } = require('../repositories/notification.repository');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authenticate);

// GET /api/notifications - current user's feed
router.get('/', (req, res) => {
  const notifications = notificationRepository.findForUser(req.user.id).map((n) => ({
    id: n.id,
    icon: n.icon,
    title: n.title,
    when: n.created_at,
    unread: Boolean(n.read === 0),
  }));
  const unread = notificationRepository.unreadCount(req.user.id);
  res.status(200).json({ status: 'success', data: { notifications, unread } });
});

// POST /api/notifications/read-all
router.post('/read-all', (req, res) => {
  notificationRepository.markAllRead(req.user.id);
  logger.info('Notifications marked as read', { userId: req.user.id });
  res.status(200).json({ status: 'success', message: 'All notifications marked as read' });
});

module.exports = router;