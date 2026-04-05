import type { Knex } from 'knex'

export async function up (db: Knex): Promise<void> {
  await db.schema.createTable('rates', (t) => {
    t.uuid('id').primary()
    t.uuid('rate_card_id').notNullable().references('id').inTable('rate_cards').onDelete('CASCADE')
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE')
    t.integer('price_per_unit').notNullable()
    t.integer('tier_floor').nullable()
    t.string('dimension_key').nullable()
    t.string('dimension_value').nullable()
    t.timestamp('effective_at').notNullable()
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now())
    t.index(['rate_card_id', 'product_id', 'effective_at'])
  })
}

export async function down (db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('rates')
}
