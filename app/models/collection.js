'use strict';

const { Model } = require('objection');
const BaseModel = require('./base_model');

const MAX_PREFIX_LENGTH = 20;

class Collection extends BaseModel {
  static get tableName() {
    return 'collections';
  }

  static get TYPES() {
    return ['Art', 'Collectibles', 'Music', 'Photography', 'Sports', 'Trading Cards', 'Utility', 'Others'];
  }

  static get softDelete() {
    return true;
  }

  static get relationMappings() {
    return {
      owner: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'user',
        join: {
          from: 'collections.owner_address',
          to: 'users.aura_address',
        },
      },
      nfts: {
        relation: Model.HasManyRelation,
        modelClass: 'nft',
        join: {
          from: 'collections.contract_address',
          to: 'nfts.contract_address',
        },
      },
      listings: {
        relation: Model.HasManyRelation,
        modelClass: 'listing',
        join: {
          from: 'collections.contract_address',
          to: 'listings.contract_address',
        },
      },
      nft_histories: {
        relation: Model.HasManyRelation,
        modelClass: 'nft_history',
        join: {
          from: 'collections.contract_address',
          to: 'nft_histories.contract_address',
        },
      },
      collection_verifications: {
        relation: Model.HasManyRelation,
        modelClass: 'collection_verification',
        join: {
          from: 'collections.contract_address',
          to: 'collection_verifications.contract_address',
        },
      },
      standard_contract: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'standard_contract',
        join: {
          from: 'collections.standard_contract_id',
          to: 'standard_contracts.id',
        },
      },
      launchpad: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'launchpad',
        join: {
          from: 'collections.contract_address',
          to: 'launchpads.collection_address',
        },
      },
    };
  }

  static get jsonAttributes() {
    return ['metadata'];
  }

  static get selectableProps() {
    return [
      'collections.id as id',
      'collections.name as name',
      'collections.slug as slug',
      'collections.symbol as symbol',
      'collections.contract_address as contract_address',
      'collections.standard_contract_id as standard_contract_id',
      'collections.description as description',
      'collections.logo as logo',
      'collections.feature as feature',
      'collections.banner as banner',
      'collections.type as type',
      'collections.owner_address as owner_address',
      'collections.minter_address as minter_address',
      'collections.website as website',
      'collections.metadata as metadata',
      'collections.created_at as created_at',
      'collections.updated_at as updated_at',
    ];
  }

  static get deletedColumn() {
    return 'deleted_at';
  }

  generateSlug(name) {
    let nameForConvert = name || this.name;
    if (!nameForConvert || !this.id) throw new Error(`${this} doesn't have enough data to create slug`);

    let prefix = nameForConvert
      .normalize('NFKD') // decompose 1 single code point into multiple combining ones e.g. "ñ" -> "\u006E\u0303"
      .replace(/[\u0300-\u036f]/g, '') // Remove "Combining Diacritical Marks" https://www.ssec.wisc.edu/~tomw/java/unicode.html#x0300
      .toLowerCase()
      .replace(/đ/g, 'd') // js normalize can't decompose đ character so have to replace it manually
      .replaceAll(/[^a-z0-9]+/g, '-')
      .slice(0, MAX_PREFIX_LENGTH);

    if (prefix.endsWith('-')) {
      prefix = prefix.slice(0, -1);
    }
    if (prefix.startsWith('-')) {
      prefix = prefix.slice(1);
    }

    return `${prefix}-${this.id}`;
  }
}

module.exports = Collection;
