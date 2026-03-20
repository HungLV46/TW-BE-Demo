'use strict';

const { Model } = require('objection');
const BaseModel = require('./base_model');

class CollectionStat extends BaseModel {
  static get tableName() {
    return 'collection_stats';
  }

  static get DURATION_TYPES() {
    return {
      // HOUR: '1h',
      // DAY: '24h',
      // WEEK: '7d',
      // MONTH: '30d',
      ALL: 'all',
    };
  }

  static get relationMappings() {
    return {
      owner: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'collection',
        join: {
          from: 'collection_stats.contract_address',
          to: 'collections.contract_address',
        },
      },
    };
  }

  static get selectableProps() {
    return [
      'collection_stats.id as id',
      'collection_stats.contract_address as contract_address',
      'collection_stats.duration_type as duration_type',
      'collection_stats.volume as volume',
      'collection_stats.prev_volume as prev_volume',
      'collection_stats.floor_price as floor_price',
      'collection_stats.sales as sales',
      'collection_stats.total_owners as total_owners',
      'collection_stats.listed_nfts as listed_nfts',
      'collection_stats.total_nfts as total_nfts',
      'collection_stats.created_at as created_at',
      'collection_stats.updated_at as updated_at',
    ];
  }
}

module.exports = CollectionStat;
