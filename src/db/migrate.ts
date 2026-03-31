import { createDatabase } from './connection.js'
import { loadConfig } from '../config/index.js'
import { up as upTenants } from './migrations/001_create_tenants.js'
import { up as upApiKeys } from './migrations/002_create_api_keys.js'
import { up as upUsers } from './migrations/003_create_users.js'
import { up as upProducts } from './migrations/004_create_products.js'
import { up as upRateCards } from './migrations/005_create_rate_cards.js'
import { up as upRates } from './migrations/006_create_rates.js'
import { up as upContentPricing } from './migrations/007_create_content_pricing.js'

const config = loadConfig()
const db = createDatabase(config.databaseUrl)

async function migrate (): Promise<void> {
  console.log('Running migrations...')
  await upTenants(db)
  await upApiKeys(db)
  await upUsers(db)
  await upProducts(db)
  await upRateCards(db)
  await upRates(db)
  await upContentPricing(db)
  console.log('Migrations complete.')
  await db.destroy()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
