const { q } = require('../db');
const { BaseRepository } = require('./base.repository');

/**
 * Reference data (properties, units, technicians, categories). These are
 * read-only lookups shared by services and observers.
 */
class ReferenceRepository {
  findProperty(id) {
    return q.propertyById().get(id);
  }

  findTechnician(id) {
    return q.technicianById().get(id);
  }

  findTechnicianByUser(userId) {
    return q.technicianByUserId().get(userId);
  }

  findUnitsForUser(userId) {
    return q.unitsForUser().all(userId);
  }

  categories() {
    return q.allCategories().all();
  }
}

module.exports = { ReferenceRepository, referenceRepository: new ReferenceRepository() };
