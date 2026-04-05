import type { Knex } from 'knex'

export async function up (db: Knex): Promise<void> {
  await db.schema.createTable('channel_events', (t) => {
    t.uuid('id').primary()
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE')
    t.string('event_type').notNullable()
    t.string('channel_id').notNullable()
    t.string('consumer_identity_key', 66).notNullable()
    t.string('content_id').notNullable()
    t.json('payload').notNullable()
    t.timestamp('timestamp').notNullable()
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now())
    t.index(['tenant_id', 'event_type'])
    t.index(['tenant_id', 'consumer_identity_key'])
    t.index(['channel_id', 'event_type'])
  })
}

export async function down (db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('channel_events')
}
