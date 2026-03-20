'use strict';

const QueueService = require('moleculer-bull');
const queueConfig = require('@config/queue').QueueConfig;
const { Collection, Nft, NftHistory, CollectionStat, Listing, MintPhase } = require('@models');
const { raw } = require('objection');
const knex = require('@config/database');
const _ = require('lodash');
const dayjs = require('dayjs');
const { ValidationError } = require('@helpers/errors.js');

module.exports = {
  name: 'sync-data',
  mixins: [QueueService(queueConfig.url, queueConfig.opts)],
  settings: {},

  queues: {
    'sync.collection-stat': {
      concurrency: 1,
      process(job) {
        return this.updateCollectionStats(job.data);
      },
    },

    'sync.collection-nft': {
      concurrency: 1,
      process(job) {
        return this.updateCollectionMetadata(job.data);
      },
    },
  },

  actions: {
    updateCollectionMetadata: {
      params: {
        nft_id: 'number|min:1|convert',
        $$strict: true,
      },
      handler(ctx) {
        if (process.env.NODE_ENV === 'test') {
          return this.updateCollectionMetadata(ctx.params);
        }
        return this.createJob('sync.collection-nft', ctx.params, { removeOnComplete: true, removeOnFail: 100 });
      },
    },

    updateCollectionMetadataByContractAddress: {
      openapi: { security: [{ bearerAuth: [] }] },
      params: {
        contract_address: 'string|min:1',
        $$strict: true,
      },
      timeout: 600000,
      async handler(ctx) {
        // Get collection along with its corresponding NFT.metadata.attributes
        const collection = await Collection.query()
          .select('id', 'contract_address')
          .where({ contract_address: ctx.params.contract_address })
          .first()
          .withGraphFetched('nfts')
          .modifyGraph('nfts', (builder) =>
            builder
              .select('id', 'burned_at', raw("metadata::json->'attributes' as attributes"))
              .whereNotNull(raw("metadata::json->'attributes'")),
          );

        if (_.isEmpty(collection)) {
          throw new ValidationError(`Contract (contract_address: ${ctx.params.contract_address}) doesn't exist!`);
        }

        // create map to combine NFT's attributres
        const attributeMap = new Map();
        collection.nfts
          .filter((nft) => !nft.isBurned())
          .forEach((nft) => this.updateAttributeMapUsingNftAttributes(attributeMap, nft.attributes));

        await collection
          .$query()
          .update({ metadata: { attributes: this.convertAttributeMapToCollectionAttributes(attributeMap) } });

        await this.createNftAttributesFromNfts(collection, null);
      },
    },
  },

  methods: {
    updateCollectionStats() {
      return Promise.allSettled(
        Object.values(CollectionStat.DURATION_TYPES).map((timeFrame) =>
          this.queryStatDataByTimeFrame(timeFrame).then((collectionStats) =>
            this.upsertCollectionStat(timeFrame, collectionStats),
          ),
        ),
      );
    },

    // return query promise
    queryStatDataByTimeFrame(timeframe) {
      // TODO calculate volume over different types of denom.
      const volumePrequery = Collection.relatedQuery('nft_histories')
        .sum(raw("(price::json->>'amount')::decimal(40,0)"))
        .where('nft_histories.event', NftHistory.EVENTS.BUY);
      const volumeSubquery = volumePrequery.clone().as('volume');
      const prevVolumeSubquery = volumePrequery.clone().as('prev_volume');
      const salesSubquery = Collection.relatedQuery('nft_histories')
        .count()
        .as('sales')
        .where('nft_histories.event', NftHistory.EVENTS.BUY);

      const timePoint = this.getTimeframeStartDateUpToCurrentTime(timeframe);
      // statistic of timeframe != DURATION_TYPES.ALL
      if (timePoint) {
        volumeSubquery.where('transaction_time', '>=', timePoint[0]);
        prevVolumeSubquery
          .where('transaction_time', '>=', timePoint[1])
          .andWhere('transaction_time', '<', timePoint[0]);
        salesSubquery.where('transaction_time', '>=', timePoint[0]);

        return Collection.query().select(
          'collections.contract_address',
          volumeSubquery,
          prevVolumeSubquery,
          salesSubquery,
        );
      }

      // statistic of timeframe = DURATION_TYPES.ALL
      const floorPriceSubquery = Collection.relatedQuery('listings')
        .min('latest_price')
        .as('floor_price')
        .where({ type: Listing.TYPE.FIXED_PRICE, status: Listing.STATUSES.ONGOING })
        .whereNotDeleted();
      const ownersSubquery = Collection.relatedQuery('nfts')
        .whereNull('burned_at')
        .countDistinct('owner_address')
        .as('total_owners');
      const nftsSubquery = Collection.relatedQuery('nfts').whereNull('burned_at').count().as('total_nfts');
      return (
        Collection.query()
          .select(
            'collections.contract_address',
            floorPriceSubquery,
            volumeSubquery,
            salesSubquery,
            ownersSubquery,
            nftsSubquery,
          )
          // At the moment, "collections.contract_address = null" is not likely to happend because the application does not
          // have any logic which leads to the condition. Just put it here for future-proofing.
          .whereNotNull('collections.contract_address')
          .withGraphFetched('launchpad.mintPhases')
          .modifyGraph('launchpad.mintPhases', (builder) =>
            builder
              .select(raw("max((config::json->'price'->>'amount')::numeric) as max_mint_price"))
              .where('starts_at', '<', new Date())
              // .where(raw("(config::json->'price'->>'amount') ~ '^\\d+$'")) // filter out records which can't be casted to type number
              .groupBy('launchpad_id'),
          )
      );
    },

    // get date to filter statistic data in a given time frame
    // return: [start time of the first time frame (counting backward from current time), start time of the second timeframe]
    getTimeframeStartDateUpToCurrentTime(timeframe) {
      switch (timeframe) {
        case CollectionStat.DURATION_TYPES.HOUR:
          return [dayjs().subtract(1, 'hour'), dayjs().subtract(2, 'hour')];
        case CollectionStat.DURATION_TYPES.DAY:
          return [dayjs().subtract(1, 'day'), dayjs().subtract(2, 'day')];
        case CollectionStat.DURATION_TYPES.WEEK:
          return [dayjs().subtract(7, 'day'), dayjs().subtract(14, 'day')];
        case CollectionStat.DURATION_TYPES.MONTH:
          return [dayjs().subtract(1, 'month'), dayjs().subtract(2, 'month')];
        case CollectionStat.DURATION_TYPES.ALL:
          return null;
        default:
          throw new Error(`${timeframe} is not supported.`);
      }
    },

    // return upsert promise
    upsertCollectionStat(timeframe, collectionStats) {
      if (_.isEmpty(collectionStats)) return 0;

      // raw knex object is used because objection doesn't support batch insert.
      return knex('collection_stats')
        .insert(
          collectionStats.map((stat) => ({
            duration_type: timeframe,
            mint_price: parseInt(stat.launchpad?.mintPhases?.[0]?.max_mint_price, 10) || 0,
            ..._.omit(stat, 'launchpad'),
          })),
        )
        .onConflict(['contract_address', 'duration_type'])
        .merge();
    },

    // Using nft.metadata.attributes to update collections.metadata
    async updateCollectionMetadata(data) {
      // get NFT, NFT's attribute, corresponding Collection and Collection's attributes
      const nft = await Nft.query()
        .select('id', 'burned_at', raw("metadata::json->'attributes' as attributes"))
        .findById(data.nft_id)
        .withGraphFetched('collection')
        .modifyGraph('collection', (builder) =>
          builder.select('id', raw("metadata::json->'attributes' as attributes")),
        );

      if (!nft.attributes || nft.attributes.length < 1) return;

      // create map to merge NFT's attributres into existing collection's attributes
      // form: trait_type|display_type => { trait_type, display_type, values[] }
      const attributeMap = new Map();
      this.updateAttributeMapUsingCollectionAttributes(attributeMap, nft.collection.attributes);
      this.updateAttributeMapUsingNftAttributes(attributeMap, nft.attributes, nft.isBurned());

      await Collection.query()
        .findById(nft.collection.id)
        .update({ metadata: { attributes: this.convertAttributeMapToCollectionAttributes(attributeMap) } });

      await this.createNftAttributesFromNfts(nft.collection, [nft]);
    },

    // attributes has form: [{ trait_type, display_type, values: ['', ...] }, ...]
    updateAttributeMapUsingCollectionAttributes(map, attributes) {
      if (!attributes || attributes.length === 0) return;

      for (let i = 0; i < attributes.length; i += 1) {
        const attribute = attributes[i];
        map.set(this.createKey(attribute.trait_type, attribute.display_type), {
          trait_type: attribute.trait_type,
          display_type: attribute.display_type,
          values: new Map(attribute.values),
        });
      }
    },

    // attributes has form: [{trait_type, display_type, value}, ...]
    updateAttributeMapUsingNftAttributes(map, attributes, burned = false) {
      if (!attributes || attributes.length === 0) return;

      for (let i = 0; i < attributes.length; i += 1) {
        const attribute = attributes[i];
        const attributeDisplayType = attribute.display_type || 'string'; // display_type: default string
        const key = this.createKey(attribute.trait_type, attributeDisplayType);

        if (map.has(key)) {
          // update value set of old attribute
          const valueMap = map.get(key).values;
          valueMap.set(attribute.value, (valueMap.get(attribute.value) || 0) + (burned ? -1 : 1)); // count number of value
        } else {
          // add a new attribute
          map.set(key, {
            trait_type: attribute.trait_type,
            display_type: attributeDisplayType,
            values: new Map([[attribute.value, 1]]),
          });
        }
      }

      // incase of remove attribute
      if (burned) {
        // eslint-disable-next-line no-restricted-syntax
        for (const [key, attribute] of map) {
          // eslint-disable-next-line no-restricted-syntax
          for (const [value, count] of attribute.values) {
            if (count <= 0) attribute.values.delete(value);
          }
          if (attribute.values.size == 0) map.delete(key);
        }
      }
    },

    convertAttributeMapToCollectionAttributes(map) {
      return [...map.values()].map((traitData) => ({
        trait_type: traitData.trait_type,
        display_type: traitData.display_type,
        values: Array.from(traitData.values),
      }));
    },

    async createNftAttributesFromNfts(collection, nfts) {
      if (nfts && nfts.length <= 0) return;

      // if there is a list of nfts, we delete exactly their attributes
      if (nfts) {
        // use in case of rerun jobs, TODO replace with unique key
        await knex('nft_attributes')
          .whereIn(
            'nft_id',
            nfts.map((nft) => nft.id),
          )
          .delete();
      } else {
        // otherwise, we delete all attributes of the collection and load all nfts
        await knex('nft_attributes').where('collection_id', '=', collection.id).delete();
        // eslint-disable-next-line no-param-reassign
        nfts = await Nft.query()
          .select('nfts.id', 'nfts.burned_at', raw("nfts.metadata::json->'attributes' as attributes"))
          .where({ contract_address: collection.contract_address })
          .whereNotNull(raw("nfts.metadata::json->'attributes'"));
      }

      const nftAttributes = nfts
        .filter((nft) => !nft.isBurned() && !_.isEmpty(nft.attributes))
        .map((nft) =>
          nft.attributes.map((attribute) => ({
            collection_id: collection.id,
            nft_id: nft.id,
            trait_type: attribute.trait_type,
            display_type: attribute.display_type || 'string',
            numeric_value: attribute.display_type === 'number' ? attribute.value : null,
            string_value: attribute.display_type !== 'number' ? attribute.value : null,
          })),
        )
        .flat();

      if (nftAttributes.length > 0) {
        // use knex object, because objection doesn't support batch insert
        await knex.batchInsert('nft_attributes', nftAttributes);
      }
    },

    /**
     * This function is needed because current Map doesn't support key whose type is object,
     * and weakmap does not prevent the object from being garbage collected.
     */
    createKey(a, b) {
      return a + '|' + b;
    },
  },

  async started() {
    if (process.env.NODE_ENV !== 'test') {
      await this.waitForServices(['api']);
      await this.broker.call('api.add_queue', { queue_name: 'sync.collection-nft' });
      await this.broker.call('api.add_queue', { queue_name: 'sync.collection-stat' });
      // TODO find appropriate period between the running of each job
      await this.createJob(
        'sync.collection-stat',
        {},
        { repeat: { every: 60000 }, removeOnComplete: true, removeOnFail: 100 },
      );
    }
  },

  async stopped() {
    await this.getQueue('sync.collection-nft').close();
  },
};
