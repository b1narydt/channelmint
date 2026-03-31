import type { Knex } from 'knex'

export async function up (db: Knex): Promise<void> {
  await db.schema.createTable('usage_summaries', (t) => {
    t.uuid('id').primary()
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE')
    t.string('consumer_identity_key', 66).notNullable()
    t.string('period_start').notNullable()
    t.string('period_end').notNullable()
    t.integer('total_satoshis_paid').notNullable().defaultTo(0)
    t.integer('total_requests').notNullable().defaultTo(0)
    t.integer('channel_count').notNullable().defaultTo(0)
    t.timestamp('updated_at').notNullable().defaultTo(db.fn.now())
    t.unique(['tenant_id', 'consumer_identity_key', 'period_start'])
    t.index(['tenant_id', 'period_start'])
  })
}

export async function down (db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('usage_summaries')
}
