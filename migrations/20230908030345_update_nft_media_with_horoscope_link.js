require('dotenv/config');
require('module-alias/register');

const HoroscopeClient = require('@helpers/horoscope/horoscope-client');

// Update old mediata data - image & animation link with Horoscope if possible
exports.up = async (knex) => {
  // Since this migration is used for updating old data so don't need to run in test
  if(process.env.NODE_ENV === 'test') { return Promise.resolve(); }

  const nfts = await knex('nfts').orderBy('id', 'desc');

  for (let i = 0, jump = 10; i < nfts.length; i += jump) {
    const updatePromisses = nfts
      .slice(i, i + jump)
      .map(nft => HoroscopeClient.getNftMediaInfo(nft).then(async mediaInfo => {
        if (mediaInfo.media.image_url || mediaInfo.media.animation_url) {
    
          return knex('nfts').where({ id: nft.id }).update({
              metadata: {
                ...nft.metadata,
                s3_image: mediaInfo.media.image_url ? mediaInfo.media.image_url: nft.metadata.s3_image,
                s3_animation: mediaInfo.media.animation_url ? mediaInfo.media.animation_url : nft.metadata.s3_animation,
              },
            });
        } else {
          console.log(nft.contract_address, nft.token_id);
        }

        return Promise.resolve();
      }));
  
    await Promise.all(updatePromisses);
  }
};

exports.down = async () => {
  // this migration can't be reversed
};
