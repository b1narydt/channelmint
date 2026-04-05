import type { Knex } from 'knex'

export async function up (db: Knex): Promise<void> {
  await db.schema.createTable('api_keys', (t) => {
    t.uuid('id').primary()
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE')
    t.string('key_hash', 64).notNullable().unique()
    t.string('prefix', 8).notNullable()
    t.text('scopes').notNullable()
    t.string('label').notNullable()
    t.timestamp('expires_at').nullable()
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now())
    t.index('prefix')
  })
}

export async function down (db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('api_keys')
}
