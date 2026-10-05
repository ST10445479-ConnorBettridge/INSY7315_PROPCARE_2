const { notificationRepository } = require('../repositories/notification.repository');
const { referenceRepository } = require('../repositories/reference.repository');
const logger = require('../utils/logger');

/**
 * Observer pattern - notification fan-out.
 *
 * A request lifecycle event is published once by the service layer and every
 * interested observer decides for itself whether it needs to notify somebody.
 * This keeps the "who cares about this event?" rules out of the service
 * methods, so adding a new channel (email, push, audit) means adding an
 * observer rather than editing every service function.
 *
 * Roles:
 *   Subject  - NotificationSubject, the observable event bus.
 *   Observer - a class exposing update(event); notified on every publish.
 */

function stampNow() {
  const d = new Date();
  return d.toISOString().slice(0, 10) + ' ' + d.toTimeString().slice(0, 5);
}

/** Insert a notification row. Kept here so observers stay free of SQL. */
function notify(userId, icon, title, stamp) {
  if (!userId) return;
  notificationRepository.insert(userId, icon, title, stamp);
}

/** Observable. Holds subscribers and broadcasts events to them. */
class NotificationSubject {
  constructor() {
    this.observers = [];
  }

  subscribe(observer) {
    if (this.observers.indexOf(observer) === -1) this.observers.push(observer);
    return () => this.unsubscribe(observer);
  }

  unsubscribe(observer) {
    const i = this.observers.indexOf(observer);
    if (i !== -1) this.observers.splice(i, 1);
  }

  /**
   * Broadcast an event. A failing observer must never break the request that
   * triggered it, so each one is isolated.
   */
  publish(event) {
    const enriched = Object.assign({ stamp: stampNow() }, event);
    for (const observer of this.observers.slice()) {
      try {
        observer.update(enriched);
      } catch (err) {
        logger.error('Notification observer failed', { observer: observer.name, error: err.message });
      }
    }
  }
}

/** Notifies the tenant about progress on a request they raised. */
class TenantLifecycleObserver {
  update(event) {
    if (event.type !== 'request.status-changed') return;
    const { row, actor, action, requestId, stamp } = event;

    if (action === 'confirm' || action === 'approve' || action === 'cancel' || action === 'reject') {
      notify(row.tenant_id, '\u2705', `Request ${requestId} was ${action}ed by ${actor.name}.`, stamp);
    }

    if (action === 'accept' || action === 'complete') {
      const techName = row.technician_name || actor.name;
      const title = action === 'accept'
        ? `${techName} accepted job ${requestId}.`
        : `${techName} marked ${requestId} complete - awaiting confirmation.`;
      notify(row.tenant_id, '\uD83D\uDD27', title, stamp);
    }
  }
}

/** Keeps the property manager in the loop on tenant and technician activity. */
class ManagerActivityObserver {
  update(event) {
    const stamp = event.stamp;

    if (event.type === 'request.status-changed') {
      const { row, actor, action, requestId } = event;
      if (action !== 'cancel' && action !== 'confirm' && action !== 'reopen' && action !== 'complete' && action !== 'reject') return;
      const prop = referenceRepository.findProperty(row.property_id);
      if (prop && prop.manager_id !== actor.id) {
        const verb = action === 'complete' ? 'completed' : `${action}ed`;
        notify(prop.manager_id, '\uD83D\uDD27', `${actor.name} ${verb} ${requestId}.`, stamp);
      }
      return;
    }

    if (event.type === 'request.created') {
      const prop = referenceRepository.findProperty(event.propertyId);
      if (prop) {
        notify(prop.manager_id, '\uD83D\uDD27', `New request ${event.requestId} submitted by ${event.tenant.name}.`, stamp);
      }
      return;
    }

    if (event.type === 'request.rated') {
      const prop = referenceRepository.findProperty(event.row.property_id);
      if (prop) {
        notify(prop.manager_id, '\u2B50', `${event.tenant.name} rated ${event.requestId} ${event.stars}/5.`, stamp);
      }
    }
  }
}

/** Tells a technician they have picked up work, and reassures the tenant. */
class TechnicianAssignmentObserver {
  update(event) {
    if (event.type !== 'request.assigned') return;
    const { row, technician, manager, requestId, stamp } = event;
    notify(technician.user_id, '\uD83D\uDD27', `You have been assigned ${requestId} - ${row.title}.`, stamp);
    notify(row.tenant_id, '\uD83D\uDD27', `${manager.name} assigned a technician to ${requestId}.`, stamp);
  }
}

/** Process-wide bus, wired up once and reused by the service layer. */
const notificationSubject = new NotificationSubject();
notificationSubject.subscribe(new TenantLifecycleObserver());
notificationSubject.subscribe(new ManagerActivityObserver());
notificationSubject.subscribe(new TechnicianAssignmentObserver());

module.exports = {
  NotificationSubject,
  TenantLifecycleObserver,
  ManagerActivityObserver,
  TechnicianAssignmentObserver,
  notificationSubject,
};
