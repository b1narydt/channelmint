import type { Knex } from 'knex'

export async function up (db: Knex): Promise<void> {
  await db.schema.createTable('users', (t) => {
    t.uuid('id').primary()
    t.string('bsv_identity_key', 66).notNullable().unique()
    t.string('email').nullable()
    t.string('ramp_customer_id').nullable()
    t.string('status').notNullable().defaultTo('active')
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now())
    t.timestamp('updated_at').notNullable().defaultTo(db.fn.now())
  })
}

export async function down (db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('users')
}
