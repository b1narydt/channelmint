import { createDatabase } from './connection.js'
import { loadConfig } from '../config/index.js'
import { up as upTenants } from './migrations/001_create_tenants.js'
import { up as upApiKeys } from './migrations/002_create_api_keys.js'
import { up as upUsers } from './migrations/003_create_users.js'

const config = loadConfig()
const db = createDatabase(config.databaseUrl)

async function migrate (): Promise<void> {
  console.log('Running migrations...')
  await upTenants(db)
  await upApiKeys(db)
  await upUsers(db)
  console.log('Migrations complete.')
  await db.destroy()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
