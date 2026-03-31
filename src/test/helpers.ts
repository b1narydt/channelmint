import { createTestDatabase } from '../db/connection.js'
import { createApp } from '../app.js'
import { up as upTenants } from '../db/migrations/001_create_tenants.js'
import { up as upApiKeys } from '../db/migrations/002_create_api_keys.js'
import { up as upUsers } from '../db/migrations/003_create_users.js'
import type { Knex } from 'knex'
import type express from 'express'

export interface TestContext {
  app: express.Express
  db: Knex
  cleanup: () => Promise<void>
}

export async function createTestContext (): Promise<TestContext> {
  const db = createTestDatabase()
  await upTenants(db)
  await upApiKeys(db)
  await upUsers(db)

  const app = createApp(db)

  return {
    app,
    db,
    cleanup: () => db.destroy()
  }
}
