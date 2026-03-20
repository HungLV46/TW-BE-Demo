const { Factory } = require('fishery');

const WhitelistFactory = Factory.define(() =>
  ({
    mint_phase_id: 1,
    aura_address: 'aura1km3p76l4yszgfpc6dzrdpmxj2skme4cqm0d2t9',
  }));
module.exports = WhitelistFactory;
