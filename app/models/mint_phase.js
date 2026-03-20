'use strict';

const { Model } = require('objection');
const BaseModel = require('./base_model');
const _ = require('lodash');

const PHASE_DATA_ATTRIBUTES = ['start_time', 'end_time', 'max_supply', 'max_nfts_per_address', 'price', 'is_public'];

class MintPhase extends BaseModel {
  static get tableName() {
    return 'mint_phases';
  }

  static get relationMappings() {
    return {
      launchpad: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'launchpads',
        join: {
          from: ['mint_phases.launchpad_id'],
          to: ['launchpads.id'],
        },
      },
      whitelists: {
        relation: Model.HasManyRelation,
        modelClass: 'whitelist',
        join: {
          from: ['mint_phases.id'],
          to: ['whitelists.mint_phase_id'],
        },
      },
    };
  }

  static get jsonAttributes() {
    return ['config'];
  }

  static get TYPE() {
    return {
      PUBLIC: 'public',
      WHITELIST: 'whitelist',
    };
  }

  toAddMessage() {
    return {
      add_mint_phase: { phase_data: _.pick(this.config, PHASE_DATA_ATTRIBUTES) },
    };
  }

  toUpdateMessage() {
    if (!this.phase_id) return null;

    return {
      update_mint_phase: {
        phase_id: this.phase_id,
        phase_data: _.pick(this.config, PHASE_DATA_ATTRIBUTES),
      },
    };
  }

  static createRemoveMessage(phaseId) {
    return { remove_mint_phase: { phase_id: phaseId } };
  }

  // mintPhases is supposed to be already sorted by start_time
  static convertToModifyMessages(mintPhases, prevMintPhasesInfo) {
    const noMessages = Math.max(mintPhases.length, prevMintPhasesInfo.length);
    return _.range(noMessages).map((index) => {
      const mintPhase = mintPhases[index];
      if (mintPhase) {
        return mintPhase.phase_id ? mintPhase.toUpdateMessage() : mintPhase.toAddMessage();
      }
      return this.createRemoveMessage(prevMintPhasesInfo[index].phase_id);
    });
  }

  static convertToAddWhitelistMessages(phases) {
    return phases
      .filter((phase) => {
        return phase.phase_id && !_.isEmpty(phase.whitelists);
      })
      .map((phase) => {
        return {
          add_whitelist: {
            phase_id: phase.phase_id,
            whitelists: phase.whitelists.map((whitelist) => {
              return whitelist.aura_address;
            }),
          },
        };
      });
  }
}

module.exports = MintPhase;
