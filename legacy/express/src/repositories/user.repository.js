const { q } = require('../db');
const { BaseRepository } = require('./base.repository');

/** Repository for users and their role/profile lookups. */
class UserRepository extends BaseRepository {
  constructor() {
    super('users', q);
  }

  findByEmail(email) {
    return q.userByEmail().get(email);
  }

  findFull(id) {
    return q.userByIdFull().get(id);
  }

  findAll() {
    return q.allUsers().all();
  }

  countByRole(role) {
    return this.prepare('SELECT COUNT(*) AS n FROM users WHERE role = ?').get(role).n;
  }
}

module.exports = { UserRepository, userRepository: new UserRepository() };
