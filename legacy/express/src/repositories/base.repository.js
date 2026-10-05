const { db } = require('../db');

/**
 * Repository pattern - data access boundary.
 *
 * Services and routes talk to repositories instead of touching SQL directly.
 * That keeps query text in one place, gives the aggregates a single interface,
 * and means a storage change (SQLite -> Postgres) is a repository change
 * rather than a change to every service.
 *
 * Subclasses expose domain-meaningful methods (findByTenant, insert, ...) and
 * hide statement preparation from callers.
 */
class BaseRepository {
  /**
   * @param {string} table physical table name
   * @param {object} [queries] named prepared statements for this aggregate
   */
  constructor(table, queries = {}) {
    this.table = table;
    this.q = queries;
  }

  /** Pre-build a statement so it is prepared once, not per call. */
  prepare(sql) {
    return db.prepare(sql);
  }

  findById(id, idColumn = 'id') {
    return this.prepare(`SELECT * FROM ${this.table} WHERE ${idColumn} = ?`).get(id);
  }

  findAll() {
    return this.prepare(`SELECT * FROM ${this.table}`).all();
  }

  count(where = '', ...params) {
    const clause = where ? ` WHERE ${where}` : '';
    return this.prepare(`SELECT COUNT(*) AS n FROM ${this.table}${clause}`).get(...params).n;
  }

  exists(id, idColumn = 'id') {
    return this.findById(id, idColumn) !== undefined;
  }

  deleteById(id, idColumn = 'id') {
    return this.prepare(`DELETE FROM ${this.table} WHERE ${idColumn} = ?`).run(id);
  }
}

module.exports = { BaseRepository };
