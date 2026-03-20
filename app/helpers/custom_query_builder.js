const { QueryBuilder } = require('objection');
const knex = require('../../config/database');

class CustomQueryBuilder extends QueryBuilder {
  // Some custom method.
  delete(forceDelete = false) {
    if (this.modelClass().softDelete && !forceDelete) {
      const patchData = {};
      patchData[this.modelClass().deletedColumn] = knex.fn.now();
      return this.patch(patchData);
    }
    return super.delete();
  }

  whereDeleted() {
    return this.whereNotNull(`${this.modelClass().tableName}.${this.modelClass().deletedColumn}`);
  }

  whereNotDeleted() {
    return this.whereNull(`${this.modelClass().tableName}.${this.modelClass().deletedColumn}`);
  }

  updateOrInsert(model) {
    if (model.id) {
      return this.update(model).where('id', model.id);
    }
    return this.insert(model);
  }

  page(page, pageSize) {
    if (page === undefined || pageSize === undefined) {
      return Promise.reject(new Error('page, pageSize are required!'));
    }

    let maxPageSize = this.modelClass().maxPageSize || 100;
    let perPage = pageSize > maxPageSize ? maxPageSize : pageSize;

    return super.page(page - 1, perPage).then((res) => {
      return {
        data: res.results,
        page,
        total: res.total,
        per_page: perPage,
      };
    });
  }
}

module.exports = CustomQueryBuilder;
