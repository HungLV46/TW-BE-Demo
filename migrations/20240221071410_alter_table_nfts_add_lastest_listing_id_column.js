/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.integer('last_listing_id').unsigned().nullable().index();
    // update newly created column
  }).then(async () => {
    const lastNftId = (await knex('nfts').orderBy('id', 'des').limit(1))[0]?.id || 0;

    let i = 0;
    for(; i <= lastNftId; i+= 10000) {
      await knex.raw(`
        UPDATE nfts 
        SET last_listing_id = l.id
        FROM (
            SELECT distinct on (contract_address, token_id) id, contract_address, token_id
            FROM listings
            ORDER BY contract_address, token_id, listing_order_status(status), id DESC
          ) as l
        WHERE
          nfts.contract_address = l.contract_address
          AND nfts.token_id = l.token_id
          AND nfts.id > ${i} AND nfts.id <= ${i+10000}
    `)
    }

    await knex.raw(`
      UPDATE nfts 
      SET last_listing_id = l.id
      FROM (
          SELECT distinct on (contract_address, token_id) id, contract_address, token_id
          FROM listings
          ORDER BY contract_address, token_id, listing_order_status(status), id DESC
        ) as l
      WHERE
        nfts.contract_address = l.contract_address
        AND nfts.token_id = l.token_id
        AND nfts.id > ${i}
    `);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.dropColumn('last_listing_id');
  });
};
