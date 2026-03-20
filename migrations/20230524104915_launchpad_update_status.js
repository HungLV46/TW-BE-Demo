/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return Promise.all([
    knex('launchpads').update({status: 'draft'}).
      where({status: 'draft'}).
      where((builder) => {
        builder.whereNull('contract_address').orWhere('contract_address', '')
      }),
    knex('launchpads').update({status: 'deployed'}).
      where({status: 'draft'}).
      where((builder) => {
        builder.whereNotNull('contract_address').andWhere('contract_address', '<>', '')
      }),
    knex('launchpads').update({status: 'deployed'}).where({status: 'inactive'}),
    knex('launchpads').
      update({status: 'ready_to_mint'}).
      where({status: 'active'}).
      whereIn('id', function() {
        this.select('launchpad_id').from('mint_phases').
          where('starts_at', '>', 'now()')
      }),
    knex('launchpads').
      update({status: 'minting'}).
      where({status: 'active'}).
      whereIn('id', function() {
        this.select('launchpad_id').from(function() {
          this.select('launchpad_id').
            min('starts_at', {as: 'starts_at'}).
            max('ends_at', {as: 'ends_at'}).
            from('mint_phases').groupBy('launchpad_id').
            as('mint_phases')
        }).
        where('starts_at', '<=', 'now()').
        andWhere('ends_at', '>=', 'now()')
      }),
    knex('launchpads').
      update({status: 'finished'}).
      where({status: 'active'}).
      whereIn('id', function() {
        this.select('launchpad_id').from(function() {
          this.select('launchpad_id').max('ends_at', {as: 'ends_at'}).
            from('mint_phases').groupBy('launchpad_id').
            as('mint_phases')
        }).
        where('ends_at', '<', 'now()')
      }),
  ])

};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return Promise.all([
    knex('launchpads').update({status: 'draft'}).where({status: 'deployed'}),
    knex('launchpads').update({status: 'active'}).where({status: 'ready_to_mint'}),
    knex('launchpads').update({status: 'active'}).where({status: 'minting'}),
    knex('launchpads').update({status: 'active'}).where({status: 'finished'}),
  ])
};
