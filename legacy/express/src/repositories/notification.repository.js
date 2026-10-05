const { q } = require('../db');
const { BaseRepository } = require('./base.repository');

/** Repository for a user's in-app notification feed. */
class NotificationRepository extends BaseRepository {
  constructor() {
    super('notifications', q);
  }

  insert(userId, icon, title, createdAt) {
    return q.insertNotification().run(userId, icon, title, createdAt);
  }

  findForUser(userId) {
    return q.notificationsForUser().all(userId);
  }

  unreadCount(userId) {
    return q.unreadCount().get(userId).n;
  }

  markAllRead(userId) {
    return q.markNotificationsRead().run(userId);
  }
}

module.exports = { NotificationRepository, notificationRepository: new NotificationRepository() };
