import { createTestDatabase } from '../db/connection.js'
import { createApp } from '../app.js'
import { up as upTenants } from '../db/migrations/001_create_tenants.js'
import { up as upApiKeys } from '../db/migrations/002_create_api_keys.js'
import { up as upUsers } from '../db/migrations/003_create_users.js'
import { up as upProducts } from '../db/migrations/004_create_products.js'
import { up as upRateCards } from '../db/migrations/005_create_rate_cards.js'
import { up as upRates } from '../db/migrations/006_create_rates.js'
import { up as upContentPricing } from '../db/migrations/007_create_content_pricing.js'
import { up as upPurchases } from '../db/migrations/008_create_purchases.js'
import { up as upServiceListings } from '../db/migrations/009_create_service_listings.js'
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
  await upProducts(db)
  await upRateCards(db)
  await upRates(db)
  await upContentPricing(db)
  await upPurchases(db)
  await upServiceListings(db)

  const app = createApp(db)

  return {
    app,
    db,
    cleanup: () => db.destroy()
  }
}
