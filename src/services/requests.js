const { OPEN_STATUSES } = require('../db');
const { AppError } = require('../middleware/errorHandler');
const { requestRepository } = require('../repositories/request.repository');
const { referenceRepository } = require('../repositories/reference.repository');
const { userRepository } = require('../repositories/user.repository');
const { notificationSubject } = require('../observers/notification.observer');
const logger = require('../utils/logger');

function nowStamp() {
  const d = new Date();
  return d.toISOString().slice(0, 10) + ' ' + d.toTimeString().slice(0, 5);
}

function listForUser(user) {
  if (user.role === 'admin') return requestRepository.findAll();
  if (user.role === 'tenant') return requestRepository.findByTenant(user.id);
  if (user.role === 'technician') {
    const tech = referenceRepository.findTechnicianByUser(user.id);
    return tech ? requestRepository.findByTechnician(tech.id) : [];
  }
  // manager - requests on managed properties
  return requestRepository.findByManager(user.id);
}

function rowToDetail(row) {
  if (!row) return null;
  return {
    id: row.id,
    propertyId: row.property_id,
    propertyName: row.property_name,
    unit: row.unit,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    category: row.category,
    categoryName: row.category_name,
    title: row.title,
    detail: row.detail,
    urgency: row.urgency,
    status: row.status,
    techId: row.tech_id,
    technicianId: row.tech_id,
    technicianName: row.technician_name,
    technicianSkill: row.technician_skill,
    created: row.created,
    updated: row.updated,
    photos: row.photos,
  };
}

function listToDetail(rows) {
  return rows.map((r) => ({
    id: r.id,
    propertyId: r.property_id,
    propertyName: r.property_name,
    unit: r.unit,
    category: r.category,
    categoryName: r.category_name,
    title: r.title,
    detail: r.detail,
    urgency: r.urgency,
    status: r.status,
    techId: r.tech_id,
    created: r.created,
    updated: r.updated,
    photos: r.photos,
  }));
}

/**
 * Object-level authorisation: does this user have access to this request?
 */
function canView(user, row) {
  const owner = userRepository.findFull(row.tenant_id);
  if (user.role === 'admin') return true;
  if (user.role === 'tenant') return row.tenant_id === user.id;
  if (user.role === 'technician') {
    const tech = referenceRepository.findTechnicianByUser(user.id);
    return !!tech && row.tech_id === tech.id;
  }
  // manager - owns the property the request belongs to
  const prop = referenceRepository.findProperty(row.property_id);
  return prop && prop.manager_id === user.id;
}

function getDetail(user, id) {
  const row = requestRepository.find(id);
  if (!row) {
    throw new AppError(`Request ${id} not found`, 404);
  }
  if (!canView(user, row)) {
    throw new AppError('You do not have permission to view this request.', 403);
  }
  const detail = rowToDetail(row);
  detail.comments = requestRepository.findComments(id).map((c) => ({
    by: c.name,
    role: c.role_label,
    when: c.created_at,
    text: c.text,
  }));
  detail.history = requestRepository.findHistory(id).map((h) => ({
    status: h.status,
    when: h.created_at,
  }));
  const rating = requestRepository.findRating(id);
  detail.rating = rating ? rating.stars : null;
  detail.photoList = requestRepository.findPhotos(id).map((p) => ({
    id: p.id,
    filename: p.filename,
    mimeType: p.mime_type,
    sizeBytes: p.size_bytes,
    when: p.created_at,
    dataUrl: 'data:' + p.mime_type + ';base64,' + p.data,
  }));
  return detail;
}

/** Valid status transitions per role, keyed by current status. */
const TRANSITIONS = {
  tenant: {
    submitted: ['cancel'],
    'under-review': ['cancel'],
    completed: ['confirm', 'reopen', 'rate'],
    onHoldUnused: [],
  },
  manager: {
    submitted: ['assign', 'approve', 'reject'],
    'under-review': ['assign', 'approve', 'reject'],
    // A rejection is not a dead end: the manager can reassign the work.
    rejected: ['assign'],
    completed: ['approve'],
  },
  technician: {
    assigned: ['accept', 'reject'],
    'in-progress': ['hold', 'complete'],
    'on-hold': ['resume'],
    submitted: ['accept'],
  },
  admin: {
    submitted: ['cancel', 'approve'],
    'under-review': ['approve'],
  },
};

function allowedActions(user, row) {
  const perRole = TRANSITIONS[user.role] || {};
  return perRole[row.status] || [];
}

function canPerform(user, row, action) {
  if (action === 'assign') return user.role === 'manager' && ['submitted', 'under-review', 'rejected'].indexOf(row.status) !== -1;
  if (action === 'rate') return user.role === 'tenant' && row.status === 'completed';
  return allowedActions(user, row).indexOf(action) !== -1;
}

const ACTION_NOTE = {
  cancel: 'Request cancelled.',
  confirm: 'Work confirmed and request closed.',
  reopen: 'Request reopened - work not fully resolved.',
  approve: 'Approved and closed by property manager.',
  accept: 'Job accepted by technician.',
  reject: 'Job rejected by technician.',
  hold: 'Placed on hold (awaiting parts or access).',
  resume: 'Work resumed.',
  complete: 'Work marked complete - awaiting tenant confirmation.',
};

function applyStatusAction(user, id, action, text) {
  const row = requestRepository.find(id);
  if (!row) {
    throw new AppError(`Request ${id} not found`, 404);
  }
  if (!canView(user, row)) {
    throw new AppError('You do not have permission to update this request.', 403);
  }
  if (!canPerform(user, row, action)) {
    throw new AppError(`Action "${action}" is not allowed for ${user.role} on a ${row.status} request.`, 400);
  }

  let nextStatus = null;
  switch (action) {
    case 'cancel': nextStatus = 'cancelled'; break;
    case 'confirm': nextStatus = 'closed'; break;
    case 'approve': nextStatus = 'closed'; break;
    case 'accept': nextStatus = 'in-progress'; break;
    case 'reject': nextStatus = 'rejected'; break;
    case 'hold': nextStatus = 'on-hold'; break;
    case 'resume': nextStatus = 'in-progress'; break;
    case 'complete': nextStatus = 'completed'; break;
    case 'reopen': nextStatus = 'in-progress'; break;
    default: break;
  }

  const when = nowStamp();
  // "reject" is used by technicians (rejecting a job) and managers (rejecting
  // the request itself), so the fallback note has to name the right actor.
  const defaultNote = action === 'reject' && user.role === 'manager'
    ? 'Request rejected by property manager.'
    : null;
  const note = text || defaultNote || ACTION_NOTE[action] || 'Status updated.';
  requestRepository.updateStatus(id, nextStatus, when.slice(0, 10));
  requestRepository.addHistory(id, statusLabel(nextStatus), when);
  requestRepository.addComment(id, user.id, user.name, roleLabel(user.role), note, when);

  // Publish the status change; observers decide who needs telling.
  notificationSubject.publish({
    type: 'request.status-changed',
    row,
    actor: user,
    action,
    requestId: id,
  });

  logger.info('Request status action', { action, requestId: id, userId: user.id });
  return getDetail(user, id);
}

function assignRequest(manager, id, technicianId, urgency, note) {
  const row = requestRepository.find(id);
  if (!row) {
    throw new AppError(`Request ${id} not found`, 404);
  }
  if (!canView(manager, row)) {
    throw new AppError('You do not have permission to assign this request.', 403);
  }
  if (manager.role !== 'manager') {
    throw new AppError('Only a property manager can assign a technician.', 403);
  }
  if (['submitted', 'under-review', 'rejected'].indexOf(row.status) === -1) {
    throw new AppError('Only submitted, under-review or rejected requests can be assigned.', 400);
  }
  const tech = referenceRepository.findTechnician(technicianId);
  if (!tech) {
    throw new AppError('Technician not found.', 404);
  }

  const when = nowStamp();
  requestRepository.assign(id, technicianId, urgency, 'assigned', when.slice(0, 10));
  requestRepository.addHistory(id, statusLabel('assigned'), when);
  const noteText = note || `Assigned to ${tech.name}.`;
  requestRepository.addComment(id, manager.id, manager.name, roleLabel('manager'), noteText, when);

  notificationSubject.publish({
    type: 'request.assigned',
    row,
    technician: tech,
    manager,
    requestId: id,
  });

  logger.info('Request assigned', { requestId: id, technicianId, managerId: manager.id });
  return getDetail(manager, id);
}

function rateRequest(tenant, id, stars) {
  const row = requestRepository.find(id);
  if (!row) {
    throw new AppError(`Request ${id} not found`, 404);
  }
  if (row.tenant_id !== tenant.id) {
    throw new AppError('Only the requesting tenant can rate this request.', 403);
  }
  if (row.status !== 'completed') {
    throw new AppError('Only completed requests can be rated.', 400);
  }
  const existing = requestRepository.findRating(id);
  if (existing) {
    throw new AppError('This request has already been rated.', 400);
  }
  const when = nowStamp();
  requestRepository.addRating(id, tenant.id, stars, when);
  requestRepository.addComment(id, tenant.id, tenant.name, roleLabel('tenant'),
    `Tenant rated the completed work ${stars} out of 5.`, when);
  notificationSubject.publish({
    type: 'request.rated',
    row,
    tenant,
    stars,
    requestId: id,
  });
  return getDetail(tenant, id);
}

function commentOnRequest(user, id, text) {
  const row = requestRepository.find(id);
  if (!row) {
    throw new AppError(`Request ${id} not found`, 404);
  }
  if (!canView(user, row)) {
    throw new AppError('You do not have permission to comment on this request.', 403);
  }
  const when = nowStamp();
  requestRepository.addComment(id, user.id, user.name, roleLabel(user.role), text, when);
  return getDetail(user, id);
}

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB decoded

/** Decodes and validates a base64 photo payload. Throws AppError on any problem. */
function decodePhotoPayload(mimeType, base64Data) {
  if (!mimeType || ALLOWED_PHOTO_TYPES.indexOf(mimeType) === -1) {
    throw new AppError(
      `Unsupported image type. Allowed types: ${ALLOWED_PHOTO_TYPES.join(', ')}.`,
      400
    );
  }
  if (!base64Data || typeof base64Data !== 'string') {
    throw new AppError('Photo data is required.', 400);
  }
  // Accept both a bare base64 string and a full data: URI.
  const cleaned = base64Data.replace(/^data:[^;]+;base64,/, '');
  let buffer;
  try {
    buffer = Buffer.from(cleaned, 'base64');
  } catch (e) {
    throw new AppError('Photo data is not valid base64.', 400);
  }
  if (!buffer.length) {
    throw new AppError('Photo data is empty.', 400);
  }
  if (buffer.length > MAX_PHOTO_BYTES) {
    throw new AppError(
      `Photo is too large. Maximum size is ${Math.round(MAX_PHOTO_BYTES / (1024 * 1024))} MB.`,
      413
    );
  }
  return { buffer, cleaned };
}

function addPhoto(user, id, photo) {
  const row = requestRepository.find(id);
  if (!row) {
    throw new AppError(`Request ${id} not found`, 404);
  }
  if (!canView(user, row)) {
    throw new AppError('You do not have permission to update this request.', 403);
  }
  const filename = (photo && typeof photo.filename === 'string' && photo.filename.trim())
    || 'photo.jpg';
  const { buffer, cleaned } = decodePhotoPayload(photo && photo.mimeType, photo && photo.data);

  requestRepository.addPhoto({
    requestId: id,
    uploadedBy: user.id,
    filename: filename.slice(0, 120),
    mimeType: photo.mimeType,
    sizeBytes: buffer.length,
    data: cleaned,
    when: nowStamp(),
  });
  return getDetail(user, id);
}

function createRequest(tenant, body) {
  const row = requestRepository.nextRequestNumber();
  const nextNum = (row.n || 1079) + 1;
  const id = `REQ-${nextNum}`;
  const today = nowStamp().slice(0, 10);

  const units = referenceRepository.findUnitsForUser(tenant.id);
  // Derive property_id from the unit the tenant submitted, rather than always
  // defaulting to the first unit in the tenant's unit list.
  const selectedUnit = units.find((u) => u.name === body.unit);
  if (!selectedUnit) {
    throw new AppError('You can only submit a request for one of your assigned units.', 400);
  }
  const propertyId = selectedUnit.property_id;

  requestRepository.insert({
    id,
    propertyId,
    unit: body.unit,
    tenantId: tenant.id,
    category: body.category,
    title: body.title,
    detail: body.detail || 'No further details provided.',
    urgency: body.urgency,
    created: today,
  });
  requestRepository.addHistory(id, statusLabel('submitted'), nowStamp());

  // Publish the new request; observers notify the property manager.
  notificationSubject.publish({
    type: 'request.created',
    propertyId,
    requestId: id,
    tenant,
  });

  logger.info('New request created', { requestId: id, tenantId: tenant.id, category: body.category });
  return getDetail(tenant, id);
}

function roleLabel(role) {
  return { tenant: 'Tenant', manager: 'Property Manager', technician: 'Technician', admin: 'Administrator' }[role] || role;
}

function statusLabel(status) {
  return {
    submitted: 'Submitted',
    'under-review': 'Under review',
    assigned: 'Assigned',
    'in-progress': 'In progress',
    'on-hold': 'On hold',
    completed: 'Completed',
    closed: 'Closed',
    cancelled: 'Cancelled',
    rejected: 'Rejected',
  }[status] || status;
}

module.exports = {
  listForUser,
  listToDetail,
  getDetail,
  canView,
  applyStatusAction,
  assignRequest,
  rateRequest,
  commentOnRequest,
  addPhoto,
  createRequest,
  roleLabel,
  statusLabel,
  OPEN_STATUSES,
};