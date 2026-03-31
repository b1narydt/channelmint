import type { Knex } from 'knex'

export async function up (db: Knex): Promise<void> {
  await db.schema.createTable('tenants', (t) => {
    t.uuid('id').primary()
    t.string('name').notNullable()
    t.string('email').notNullable().unique()
    t.string('bsv_identity_key', 66).notNullable().unique()
    t.string('channel_endpoint_url').nullable()
    t.string('webhook_url').nullable()
    t.string('webhook_secret').nullable()
    t.string('status').notNullable().defaultTo('active')
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now())
    t.timestamp('updated_at').notNullable().defaultTo(db.fn.now())
  })
}

export async function down (db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('tenants')
}
