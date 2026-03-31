import { createDatabase } from './connection.js'
import { loadConfig } from '../config/index.js'
import { down as downUsers } from './migrations/003_create_users.js'
import { down as downApiKeys } from './migrations/002_create_api_keys.js'
import { down as downTenants } from './migrations/001_create_tenants.js'

const config = loadConfig()
const db = createDatabase(config.databaseUrl)

async function rollback (): Promise<void> {
  console.log('Rolling back migrations...')
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
