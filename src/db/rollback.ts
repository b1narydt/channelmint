import { createDatabase } from './connection.js'
import { loadConfig } from '../config/index.js'
import { down as downContentPricing } from './migrations/007_create_content_pricing.js'
import { down as downRates } from './migrations/006_create_rates.js'
import { down as downRateCards } from './migrations/005_create_rate_cards.js'
import { down as downProducts } from './migrations/004_create_products.js'
import { down as downUsers } from './migrations/003_create_users.js'
import { down as downApiKeys } from './migrations/002_create_api_keys.js'
import { down as downTenants } from './migrations/001_create_tenants.js'

const config = loadConfig()
const db = createDatabase(config.databaseUrl)

async function rollback (): Promise<void> {
  console.log('Rolling back migrations...')
  await downContentPricing(db)
  await downRates(db)
  await downRateCards(db)
  await downProducts(db)
  await downUsers(db)
  await downApiKeys(db)
  await downTenants(db)
  console.log('Rollback complete.')
  await db.destroy()
}

rollback().catch((err) => {
  console.error('Rollback failed:', err)
  process.exit(1)
})
