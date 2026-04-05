import type { Knex } from 'knex'

export async function up (db: Knex): Promise<void> {
  await db.schema.createTable('purchases', (t) => {
    t.uuid('id').primary()
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    t.string('ramp_purchase_id').nullable().unique()
    t.string('ramp_view_token').nullable()
    t.string('target_address').notNullable()
    t.float('fiat_amount').nullable()
    t.string('fiat_currency', 3).nullable()
    t.float('bsv_amount').nullable()
    t.string('status').notNullable().defaultTo('pending')
    t.json('ramp_webhook_payload').nullable()
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now())
    t.timestamp('updated_at').notNullable().defaultTo(db.fn.now())
    t.index(['user_id', 'status'])
  })
}

export async function down (db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('purchases')
}
