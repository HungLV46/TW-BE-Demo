const { Factory } = require('fishery');
const dayjs = require('dayjs');

const WhitelistFactory = require('./whitelist_factory');

const MintPhaseFactory = Factory.define(({ sequence, associations, transientParams }) => {
  const { totalSupply, maxNftsPerAddress, isPublic } = transientParams;
  return {
    name: 'mint phase ' + sequence,
    type: 'Art',
    config: `{"price": {"denom": "uaura", "amount": "5"}, "end_time": "${
      dayjs().add(360 + 360 * (sequence - 1), 'second') + '000000'
    }", "is_public": ${isPublic !== false}, "max_supply": ${totalSupply || 10}, "start_time": "${
      dayjs().add(3 + 360 * (sequence - 1), 'second') + '000000'
    }", "total_supply": ${totalSupply || 10}, "max_nfts_per_address": ${maxNftsPerAddress || 10}}`,
    starts_at: dayjs().add(5 + 360 * (sequence - 1), 'second'),
    ends_at: dayjs().add(360 + 360 * (sequence - 1), 'second'),
    launchpad_id: 1,
    whitelists: WhitelistFactory.build(associations.whitelists) || [],
  };
});

module.exports = { MintPhaseFactory };
