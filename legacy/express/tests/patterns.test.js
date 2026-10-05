const { seedDatabase } = require('../src/db');
const {
  NotificationSubject,
  TenantLifecycleObserver,
  ManagerActivityObserver,
  TechnicianAssignmentObserver,
  notificationSubject,
} = require('../src/observers/notification.observer');
const { requestRepository } = require('../src/repositories/request.repository');
const { notificationRepository } = require('../src/repositories/notification.repository');
const { userRepository } = require('../src/repositories/user.repository');
const { referenceRepository } = require('../src/repositories/reference.repository');

/**
 * Unit tests for the Repository and Observer patterns introduced in Task 2.
 * The API suites cover these paths end-to-end; these pin the pattern contracts
 * themselves (subscribe/unsubscribe, publish fan-out, repository interface).
 */

// These suites exercise the repositories directly rather than through the HTTP
// layer, so the seed that app.js normally awaits has to run here instead.
beforeAll(async () => {
  await seedDatabase();
});

describe('Observer pattern - NotificationSubject', () => {
  it('notifies every subscribed observer on publish', () => {
    const subject = new NotificationSubject();
    const seen = [];
    subject.subscribe({ name: 'a', update: (e) => seen.push(['a', e.type]) });
    subject.subscribe({ name: 'b', update: (e) => seen.push(['b', e.type]) });

    subject.publish({ type: 'test.event' });

    expect(seen).toEqual([['a', 'test.event'], ['b', 'test.event']]);
  });

  it('does not add the same observer twice', () => {
    const subject = new NotificationSubject();
    const observer = { name: 'dup', update: jest.fn() };
    subject.subscribe(observer);
    subject.subscribe(observer);

    subject.publish({ type: 'test.event' });

    expect(observer.update).toHaveBeenCalledTimes(1);
  });

  it('stops notifying after unsubscribe', () => {
    const subject = new NotificationSubject();
    const observer = { name: 'gone', update: jest.fn() };
    const remove = subject.subscribe(observer);

    remove();
    subject.publish({ type: 'test.event' });

    expect(observer.update).toHaveBeenCalledTimes(0);
  });

  it('isolates a failing observer so the publish still completes', () => {
    const subject = new NotificationSubject();
    const good = { name: 'good', update: jest.fn() };
    subject.subscribe({
      name: 'bad',
      update: () => {
        throw new Error('observer exploded');
      },
    });
    subject.subscribe(good);

    expect(() => subject.publish({ type: 'test.event' })).not.toThrow();
    expect(good.update).toHaveBeenCalledTimes(1);
  });

  it('stamps every event it publishes', () => {
    const subject = new NotificationSubject();
    let received = null;
    subject.subscribe({ name: 'c', update: (e) => { received = e; } });

    subject.publish({ type: 'test.event' });

    expect(typeof received.stamp).toBe('string');
    expect(received.stamp.length).toBeGreaterThan(0);
  });

  it('registers the concrete notification observers on the shared bus', () => {
    const names = notificationSubject.observers.map((o) => o.constructor.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'TenantLifecycleObserver',
        'ManagerActivityObserver',
        'TechnicianAssignmentObserver',
      ])
    );
  });

  it('exposes observers that all implement update()', () => {
    for (const observer of [
      new TenantLifecycleObserver(),
      new ManagerActivityObserver(),
      new TechnicianAssignmentObserver(),
    ]) {
      expect(typeof observer.update).toBe('function');
    }
  });
});

describe('Repository pattern - requestRepository', () => {
  it('reads a seeded request and maps it to a detail shape', () => {
    const row = requestRepository.find('REQ-1045');
    expect(row).toBeDefined();
    expect(row.id).toBe('REQ-1045');
    expect(typeof row.tenant_id).toBe('string');
  });

  it('returns undefined for an unknown request id', () => {
    expect(requestRepository.find('REQ-DOES-NOT-EXIST')).toBeUndefined();
  });

  it('scopes requests by tenant', () => {
    // requestAll is a list projection, so take the tenant from the detail row.
    const tenantId = requestRepository.find('REQ-1045').tenant_id;
    const scoped = requestRepository.findByTenant(tenantId);
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((r) => r.id.startsWith('REQ-'))).toBe(true);
  });

  it('exposes comments, history and rating for a request', () => {
    expect(Array.isArray(requestRepository.findComments('REQ-1045'))).toBe(true);
    expect(Array.isArray(requestRepository.findHistory('REQ-1045'))).toBe(true);
    // A request is rated at most once; unrated requests yield no row.
    const rating = requestRepository.findRating('REQ-1045');
    expect(rating === undefined || typeof rating.stars === 'number').toBe(true);
  });

  it('allocates the next request number', () => {
    expect(typeof requestRepository.nextRequestNumber().n).toBe('number');
  });
});

describe('Repository pattern - user and reference repositories', () => {
  it('finds a user by email and rejects an unknown one', () => {
    const user = userRepository.findByEmail('michael.jacobs@obsrealty.co.za');
    expect(user).toBeDefined();
    expect(user.role).toBe('manager');
    expect(userRepository.findByEmail('nobody@nowhere.co.za')).toBeUndefined();
  });

  it('counts users by role', () => {
    expect(userRepository.countByRole('tenant')).toBeGreaterThan(0);
    expect(userRepository.countByRole('admin')).toBeGreaterThan(0);
  });

  it('resolves reference data used for authorisation', () => {
    const property = referenceRepository.findProperty('P1');
    expect(property).toBeDefined();
    expect(typeof property.manager_id).toBe('string');
  });
});

describe('Repository pattern - notificationRepository', () => {
  it('writes a notification and reads it back for the user', () => {
    const before = notificationRepository.findForUser('U1').length;
    notificationRepository.insert('U1', '\uD83D\uDD27', 'Repository pattern test', '2026-01-01 00:00');
    const after = notificationRepository.findForUser('U1');

    expect(after.length).toBe(before + 1);
    expect(after.some((n) => n.title === 'Repository pattern test')).toBe(true);
  });

  it('reports and clears the unread count', () => {
    const unreadBefore = notificationRepository.unreadCount('U1');
    expect(typeof unreadBefore).toBe('number');

    notificationRepository.markAllRead('U1');

    expect(notificationRepository.unreadCount('U1')).toBe(0);
  });

  it('enforces the NOT NULL integrity constraint on the recipient', () => {
    // The schema rejects an orphan notification rather than storing it.
    expect(() => notificationRepository.insert(null, 'x', 'orphan', '2026-01-01 00:00')).toThrow();
  });

  it('does not notify a recipient-less event through the observer bus', () => {
    const before = notificationRepository.findForUser('U1').length;
    // ManagerActivityObserver only fires for a real property, so nothing is
    // written when the event carries no recipient.
    notificationSubject.publish({ type: 'request.rated', row: { property_id: 'NOPE' }, tenant: { name: 'X' }, stars: 5, requestId: 'REQ-0000' });
    expect(notificationRepository.findForUser('U1').length).toBe(before);
  });
});
