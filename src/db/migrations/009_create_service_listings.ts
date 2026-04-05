import type { Knex } from 'knex'

export async function up (db: Knex): Promise<void> {
  await db.schema.createTable('service_listings', (t) => {
    t.uuid('id').primary()
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE')
    t.string('name').notNullable()
    t.text('description').notNullable()
    t.string('category').notNullable()
    t.string('channel_endpoint_url').notNullable()
    t.string('thumbnail_url').nullable()
    t.text('tags').notNullable().defaultTo('[]')
    t.string('status').notNullable().defaultTo('active')
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now())
    t.timestamp('updated_at').notNullable().defaultTo(db.fn.now())
    t.index(['status', 'category'])
    t.index(['tenant_id'])
  })
}

export async function down (db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('service_listings')
}
