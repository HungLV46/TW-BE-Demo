const { ServiceBroker } = require('moleculer');

const OfferServiceSchema = require('@services/sync_offer.service');
const { Offer } = require('@models');
const knex = require('@config/database');

const dayjs = require('dayjs');
const _ = require('lodash');

describe("Test 'sync_offer'", () => {
  let broker = new ServiceBroker({ logger: false });
  const syncOfferService = broker.createService(OfferServiceSchema);

  beforeAll(async () => {
    await broker.start();
  });
  afterAll(async () =>
    await broker.stop());

  describe('Test sync offer expiration', () => {
    /**
     * 1. Create 3 ONGOING offers:
     *    - offer 0 end_time < Date.now()
     *    - offer 1 end_time < Date.now()
     *    - offer 2 end_time > Date.now()
     *    - offer 3 end_time < Date.now(), status CANCELLED
     * 2. After calling updateOfferExpiration
     *    - offer 0 status = ENDED
     *    - offer 1 status = ENDED
     *    - offer 2 status = ONGOING
     *    - offer 3 unchange
     */
    test('should update expired offer to CANCELLED', async () => {
      // setup.
      await Offer.query().del();
      const offers = await knex('offers')
        .insert([
          {
            offerer_address: 'user address 1',
            token_id: 'token id 1',
            contract_address: 'contract address 1',
            store_address: 'store address 1',
            status: Offer.STATUSES.ONGOING,
            price: {
              denome: 'aura',
              amount: '1000000000000000000',
            },
            end_time: dayjs().subtract(1, 'second'),
          },
          {
            offerer_address: 'user address 2',
            token_id: 'token id 2',
            contract_address: 'contract address 2',
            store_address: 'store address 2',
            status: Offer.STATUSES.ONGOING,
            price: {
              denome: 'aura',
              amount: '1000000000000000000',
            },
            end_time: dayjs().subtract(2, 'second'),
          },
          {
            offerer_address: 'user address 3',
            token_id: 'token id 3',
            contract_address: 'contract address 3',
            store_address: 'store address 3',
            status: Offer.STATUSES.ONGOING,
            price: {
              denome: 'aura',
              amount: '1000000000000000000',
            },
            end_time: dayjs().add(100, 'second'),
          },
          {
            offerer_address: 'user address 4',
            token_id: 'token id 4',
            contract_address: 'contract address 4',
            store_address: 'store address 4',
            status: Offer.STATUSES.CANCELLED,
            price: {
              denome: 'aura',
              amount: '1000000000000000000',
            },
            end_time: dayjs().subtract(2, 'second'),
          },
        ])
        .returning('*');

      // execute.
      await syncOfferService.updateOfferExpiration();

      // verify.
      const allOffers = await Offer.query().whereIn(
        'id',
        offers.map((offer) =>
          offer.id),
      );
      expect(_.sortBy(allOffers, 'id')).toEqual([
        {
          ...offers[0],
          status: Offer.STATUSES.ENDED,
          updated_at: expect.any(Date),
        },
        {
          ...offers[1],
          status: Offer.STATUSES.ENDED,
          updated_at: expect.any(Date),
        },
        {
          ...offers[2],
          status: Offer.STATUSES.ONGOING,
          updated_at: expect.any(Date),
        },
        offers[3],
      ]);
    });
  });
});
