const { q } = require('../db');
const { BaseRepository } = require('./base.repository');

/**
 * Repository for the maintenance-request aggregate: the request itself plus its
 * comments, history and rating. Owns every read/write of request data so the
 * service layer can stay focused on business rules and authorisation.
 */
class RequestRepository extends BaseRepository {
  constructor() {
    super('requests', q);
  }

  // ---- reads -------------------------------------------------------------

  find(id) {
    return q.requestById().get(id);
  }

  findAll() {
    return q.requestAll().all();
  }

  findByTenant(tenantId) {
    return q.requestByTenant().all(tenantId);
  }

  findByManager(managerId) {
    return q.requestByManagerProps().all(managerId);
  }

  findByTechnician(technicianId) {
    return q.requestByTechnician().all(technicianId);
  }

  findComments(requestId) {
    return q.commentsForRequest().all(requestId);
  }

  findHistory(requestId) {
    return q.historyForRequest().all(requestId);
  }

  findRating(requestId) {
    return q.ratingForRequest().get(requestId);
  }

  nextRequestNumber() {
    return q.nextReqNumber().get();
  }

  // ---- writes ------------------------------------------------------------

  insert({ id, propertyId, unit, tenantId, category, title, detail, urgency, created }) {
    return q.insertRequest().run(
      id, propertyId, unit, tenantId, category, title, detail, urgency, created, created
    );
  }

  updateStatus(id, status, updated) {
    return q.updateRequestStatus().run(status, updated, id);
  }

  assign(id, technicianId, urgency, status, updated) {
    return q.updateRequestAssign().run(technicianId, urgency, status, updated, id);
  }

  addPhoto({ requestId, uploadedBy, filename, mimeType, sizeBytes, data, when }) {
    q.insertRequestPhoto().run(requestId, uploadedBy, filename, mimeType, sizeBytes, data, when);
    return q.incrementPhotos().run(when, requestId);
  }

  findPhotos(requestId) {
    return q.photosForRequest().all(requestId);
  }

  findPhotoById(photoId) {
    return q.photoById().get(photoId);
  }

  addHistory(requestId, status, when) {
    return q.insertHistory().run(requestId, status, when);
  }

  addComment(requestId, userId, name, roleLabel, text, when) {
    return q.insertComment().run(requestId, userId, name, roleLabel, text, when);
  }

  addRating(requestId, userId, stars, when) {
    return q.insertRating().run(requestId, userId, stars, when);
  }
}

module.exports = { RequestRepository, requestRepository: new RequestRepository() };
