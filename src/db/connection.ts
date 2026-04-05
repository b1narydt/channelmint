import knex, { type Knex } from 'knex'

export function createDatabase (databaseUrl: string): Knex {
  if (databaseUrl.startsWith('sqlite://')) {
    const filename = databaseUrl.replace('sqlite://', '')
    return knex({
      client: 'better-sqlite3',
      connection: { filename },
      useNullAsDefault: true
    })
  }

  return knex({
    client: 'pg',
    connection: databaseUrl,
    pool: { min: 2, max: 10 }
  })
}

export function createTestDatabase (): Knex {
  return knex({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true
  })
}
