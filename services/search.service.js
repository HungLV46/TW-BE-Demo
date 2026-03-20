'use strict';

const {
  Nft, Listing, NftAttribute, NftHistory
} = require('@models');
const { raw } = require('objection');
const _ = require('lodash');

module.exports = {
  name: 'search',

  settings: {},

  dependencies: [],

  actions: {
    search: {
      params: {
        contract_address: 'string|min:1',
        conditions: {
          type: 'object',
          optional: true,
          props: {
            name: 'string|optional',
            listing_types: {
              type: 'array',
              optional: true,
              items: 'string',
              enum: Object.values(Listing.TYPE),
            },
            price: {
              type: 'object',
              optional: true,
              props: {
                min: 'number|optional|convert',
                max: 'number|optional|convert',
              },
              strict: true,
            },
            string_traits: {
              type: 'array',
              optional: true,
              items: {
                type: 'object',
                props: {
                  trait_type: 'string',
                  values: {
                    type: 'array',
                    items: 'string',
                  },
                },
                strict: true,
              },
            },
            numeric_traits: {
              type: 'array',
              optional: true,
              items: {
                type: 'object',
                props: {
                  trait_type: 'string',
                  min: 'number|convert',
                  max: 'number|convert',
                },
                strict: true,
              },
            },
          },
          strict: true,
        },
        order: {
          type: 'enum',
          optional: true,
          values: Object.values(Nft.ORDER_TYPE),
          default: Nft.ORDER_TYPE.RECENTLY_LISTED,
        },
        page: 'number|min:1|optional|default:1|convert',
        page_size: `number|min:1|max:${Nft.maxPageSize}|optional|default:25|convert`,
        $$strict: true,
      },
      async handler(ctx) {
        const queryBuilder = Nft.query()
          .where('nfts.contract_address', ctx.params.contract_address)
          .whereNull('nfts.banned_at')
          .whereNull('nfts.burned_at')
          .withGraphJoined('last_listing as listing');
        const searchConditions = ctx.params.conditions;

        if (searchConditions) {
          this.buildNftQueryByNameConditions(queryBuilder, searchConditions);
          this.buildNftQueryByListingTypeConditions(queryBuilder, searchConditions);
          this.buildNftQueryByPriceConditions(queryBuilder, searchConditions);
          await this.buildNftQueryByAttributeConditions(queryBuilder, searchConditions); // TODO improve performance
        }

        this.buildNftQueryByOrderConditions(queryBuilder, ctx.params.order);
        return queryBuilder.page(ctx.params.page, ctx.params.page_size);
      },
    },
  },

  methods: {
    buildNftQueryByNameConditions(queryBuilder, searchConditions) {
      if (searchConditions.name) {
        queryBuilder.where('name', 'ilike', `%${searchConditions.name}%`);
      }
    },

    buildNftQueryByListingTypeConditions(queryBuilder, searchConditions) {
      if (!_.isEmpty(searchConditions.listing_types)) {
        queryBuilder.where({ 'listing.status': Listing.STATUSES.ONGOING });
        queryBuilder.whereIn('listing.type', searchConditions.listing_types);
      }
    },

    buildNftQueryByPriceConditions(queryBuilder, searchConditions) {
      if (searchConditions.price) {
        queryBuilder.where({ 'listing.status': Listing.STATUSES.ONGOING });
        if (searchConditions.price.min !== undefined) {
          queryBuilder.where('listing.latest_price', '>=', searchConditions.price.min);
        }
        if (searchConditions.price.max !== undefined) {
          queryBuilder.where('listing.latest_price', '<=', searchConditions.price.max);
        }
      }
    },

    async buildNftQueryByAttributeConditions(queryBuilder, searchConditions) {
      const stringConditionSpecified = searchConditions.string_traits && searchConditions.string_traits.length > 0;
      const numericConditionSpecified = searchConditions.numeric_traits && searchConditions.numeric_traits.length > 0;

      if (!stringConditionSpecified && !numericConditionSpecified) return;

      // add query filtering by string traits.
      // initial query to start intersecting chain
      const nftIdQueryBuilder = stringConditionSpecified
        ? NftAttribute.query()
          .distinct()
          .select('nft_id')
          .where({ trait_type: searchConditions.string_traits[0].trait_type, display_type: 'string' })
          .whereIn('string_value', searchConditions.string_traits[0].values)
        : NftAttribute.query()
          .distinct()
          .select('nft_id')
          .where({ trait_type: searchConditions.numeric_traits[0].trait_type, display_type: 'number' })
          .andWhere('numeric_value', '>=', searchConditions.numeric_traits[0].min)
          .andWhere('numeric_value', '<=', searchConditions.numeric_traits[0].max);

      if (stringConditionSpecified) {
        searchConditions.string_traits.slice(1).forEach((trait) =>
          nftIdQueryBuilder.intersect([
            // intersect auto remove duplication
            NftAttribute.query()
              .select('nft_id')
              .where({ trait_type: trait.trait_type, display_type: 'string' })
              .whereIn('string_value', trait.values),
          ]));
      }

      // add query filtering by numeric traits.
      if (numericConditionSpecified) {
        searchConditions.numeric_traits
          .slice(stringConditionSpecified ? 0 : 1)
          .forEach((trait) =>
            nftIdQueryBuilder.intersect([
              NftAttribute.query()
                .select('nft_id')
                .where({ trait_type: trait.trait_type, display_type: 'number' })
                .andWhere('numeric_value', '>=', trait.min)
                .andWhere('numeric_value', '<=', trait.max),
            ]));
      }

      queryBuilder.whereIn('nfts.id', nftIdQueryBuilder);
    },

    buildNftQueryByOrderConditions(queryBuilder, orderConditions) {
      // the first ordering condition.
      switch (orderConditions) {
        case Nft.ORDER_TYPE.RECENTLY_CREATED:
          queryBuilder.orderBy('id', 'desc');
          return; // avoid double order by id statement.
        case Nft.ORDER_TYPE.RECENTLY_SOLD: {
          queryBuilder
            .leftJoin(
              NftHistory.query()
                .select('token_id', 'contract_address', raw('max(transaction_time) as tx_time'))
                .where('event', NftHistory.EVENTS.BUY)
                .groupBy('token_id', 'contract_address')
                .as('nft_buy_events')
                .toKnexQuery(),
              // eslint-disable-next-line func-names
              function () {
                this.on('nfts.token_id', '=', 'nft_buy_events.token_id').on(
                  'nfts.contract_address',
                  '=',
                  'nft_buy_events.contract_address',
                );
              },
            )
            .orderBy('nft_buy_events.tx_time', 'desc', 'last');
          break;
        }
        case Nft.ORDER_TYPE.LOWEST_PRICE:
          queryBuilder.orderBy(raw('listing_order_status(listing.status)')); // Order: status = ongoing, other status, listing null
          queryBuilder.orderBy('listing.latest_price', 'asc', 'last');
          break;
        case Nft.ORDER_TYPE.HIGHEST_PRICE:
          queryBuilder.orderBy(raw('listing_order_status(listing.status)'));
          queryBuilder.orderBy('listing.latest_price', 'desc', 'last');
          break;
        case Nft.ORDER_TYPE.ENDING_SOON:
          queryBuilder.orderBy(raw('listing_order_status(listing.status)'));
          queryBuilder.orderBy('listing.end_time', 'asc', 'last');
          break;
        case Nft.ORDER_TYPE.RECENTLY_LISTED:
        default:
          queryBuilder.orderBy(raw('listing_order_status(listing.status)'));
          queryBuilder.orderBy('listing.created_at', 'desc', 'last'); // TODO add column for ordering recently listed
      }

      // the second ordering condition.
      queryBuilder.orderBy('id', 'desc');
    },
  },
};
