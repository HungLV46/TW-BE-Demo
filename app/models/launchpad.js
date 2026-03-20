'use strict';

const { Model } = require('objection');
const BaseModel = require('./base_model');
const crypto = require('crypto');
const _ = require('lodash');

const COLLECTION_INFO_ATTRIBUTES = [
  'creator',
  'name',
  'symbol',
  'max_supply',
  'uri_prefix',
  'uri_suffix',
  'token_id_offset',
  'reserved_tokens',
  'royalty_percentage',
  'royalty_payment_address',
];

class Launchpad extends BaseModel {
  static get tableName() {
    return 'launchpads';
  }

  static get relationMappings() {
    return {
      nft: {
        relation: Model.HasManyRelation,
        modelClass: 'nfts',
        join: {
          from: ['launchpads.collection_address'],
          to: ['nfts.contract_address'],
        },
      },
      collection: {
        relation: Model.HasOneRelation,
        modelClass: 'collections',
        join: {
          from: 'launchpads.collection_address',
          to: 'collections.contract_address',
        },
      },
      mintPhases: {
        relation: Model.HasManyRelation,
        modelClass: 'mint_phase',
        join: {
          from: ['launchpads.id'],
          to: ['mint_phases.launchpad_id'],
        },
        orderBy: ['mint_phases.starts_at'],
      },
    };
  }

  static get jsonAttributes() {
    return ['project_information', 'collection_information'];
  }

  static get STATUSES() {
    return {
      DRAFT: 'draft', // created
      DEPLOYED: 'deployed', // deployed
      READY_TO_MINT: 'ready_to_mint', // activated
      INACTIVE: 'inactive', // inactive (after deactivating a minting launchpad)
      MINTING: 'minting', // start minting the first phase
      FINISHED: 'finished', // end the last phase
    };
  }

  getInstantiateMessage(collectionContractCodeId) {
    return {
      random_seed: crypto.randomBytes(32).toString('hex'),
      colection_code_id: parseInt(collectionContractCodeId, 10),
      launchpad_fee: 0, // TODO specified by admin
      // launchpad_collector: instantiatorAddress, TODO specified by admin
      collection_info: _.pick(this.collection_information, COLLECTION_INFO_ATTRIBUTES),
    };
  }

  getCollection(collectionContractId, collectionAddress) {
    const collection = {
      name: this.collection_information.name,
      symbol: this.collection_information.symbol,
      contract_address: collectionAddress,
      standard_contract_id: collectionContractId,
      description: this.collection_information.description,
      logo: this.collection_information.logo,
      feature: this.collection_information.feature,
      banner: this.collection_information.banner,
      minter_address: this.contract_address,
      owner_address: this.collection_information.creator,
      verified_at: new Date(),
      // metadata: ...
      type: this.collection_information.category,
      website: this.collection_information.website,
      royalty_percentage: this.collection_information.royalty_percentage,
      royalty_payment_address: this.collection_information.royalty_payment_address,
      collection_verifications: [],
    };

    if (this.collection_information.discord) {
      collection.collection_verifications.push({
        contract_address: collectionAddress,
        type: 'discord',
        invite_link: this.collection_information.discord,
      });
    }

    if (this.collection_information.twitter) {
      collection.collection_verifications.push({
        contract_address: collectionAddress,
        type: 'twitter',
        additional_info: {
          profile_link: this.collection_information.twitter,
        },
      });
    }

    if (this.collection_information.telegram) {
      collection.collection_verifications.push({
        contract_address: collectionAddress,
        type: 'telegram',
        invite_link: this.collection_information.telegram,
      });
    }

    return collection;
  }
}

module.exports = Launchpad;
