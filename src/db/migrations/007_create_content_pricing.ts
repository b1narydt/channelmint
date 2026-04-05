import type { Knex } from 'knex'

export async function up (db: Knex): Promise<void> {
  await db.schema.createTable('content_pricing', (t) => {
    t.uuid('id').primary()
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE')
    t.uuid('rate_card_id').notNullable().references('id').inTable('rate_cards').onDelete('CASCADE')
    t.string('content_pattern').notNullable()
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE')
    t.text('recipients').notNullable()
    t.integer('priority').notNullable().defaultTo(0)
    t.string('status').notNullable().defaultTo('active')
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now())
    t.index(['tenant_id', 'status', 'priority'])
  })
}

export async function down (db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('content_pricing')
}
