import type { Knex } from 'knex'

export async function up (db: Knex): Promise<void> {
  await db.schema.createTable('rate_cards', (t) => {
    t.uuid('id').primary()
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE')
    t.string('name').notNullable()
    t.text('description').nullable()
    t.string('status').notNullable().defaultTo('active')
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now())
    t.index(['tenant_id', 'status'])
  })
}

export async function down (db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('rate_cards')
}
