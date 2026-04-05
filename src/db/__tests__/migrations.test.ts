import { createTestDatabase } from '../connection.js'
import type { Knex } from 'knex'
import { up as upTenants, down as downTenants } from '../migrations/001_create_tenants.js'
import { up as upApiKeys, down as downApiKeys } from '../migrations/002_create_api_keys.js'
import { up as upUsers, down as downUsers } from '../migrations/003_create_users.js'

describe('migrations', () => {
  let db: Knex

  beforeEach(() => {
    db = createTestDatabase()
  })

  afterEach(async () => {
    await db.destroy()
  })

  test('001: creates tenants table with correct columns', async () => {
    await upTenants(db)
    const columns = await db('tenants').columnInfo()
    expect(columns).toHaveProperty('id')
    expect(columns).toHaveProperty('name')
    expect(columns).toHaveProperty('email')
    expect(columns).toHaveProperty('bsv_identity_key')
    expect(columns).toHaveProperty('channel_endpoint_url')
    expect(columns).toHaveProperty('webhook_url')
    expect(columns).toHaveProperty('webhook_secret')
    expect(columns).toHaveProperty('status')
    expect(columns).toHaveProperty('created_at')
    expect(columns).toHaveProperty('updated_at')
  })

  test('001: down drops tenants table', async () => {
    await upTenants(db)
    await downTenants(db)
    const exists = await db.schema.hasTable('tenants')
    expect(exists).toBe(false)
  })

  test('002: creates api_keys table with correct columns', async () => {
    await upTenants(db)
    await upApiKeys(db)
    const columns = await db('api_keys').columnInfo()
    expect(columns).toHaveProperty('id')
    expect(columns).toHaveProperty('tenant_id')
    expect(columns).toHaveProperty('key_hash')
    expect(columns).toHaveProperty('prefix')
    expect(columns).toHaveProperty('scopes')
    expect(columns).toHaveProperty('label')
    expect(columns).toHaveProperty('expires_at')
    expect(columns).toHaveProperty('created_at')
  })

  test('003: creates users table with correct columns', async () => {
    await upUsers(db)
    const columns = await db('users').columnInfo()
    expect(columns).toHaveProperty('id')
    expect(columns).toHaveProperty('bsv_identity_key')
    expect(columns).toHaveProperty('email')
    expect(columns).toHaveProperty('ramp_customer_id')
    expect(columns).toHaveProperty('status')
    expect(columns).toHaveProperty('created_at')
    expect(columns).toHaveProperty('updated_at')
  })

  test('all migrations run and rollback in sequence', async () => {
    await upTenants(db)
    await upApiKeys(db)
    await upUsers(db)
    expect(await db.schema.hasTable('tenants')).toBe(true)
    expect(await db.schema.hasTable('api_keys')).toBe(true)
    expect(await db.schema.hasTable('users')).toBe(true)
    await downUsers(db)
    await downApiKeys(db)
    await downTenants(db)
    expect(await db.schema.hasTable('tenants')).toBe(false)
    expect(await db.schema.hasTable('api_keys')).toBe(false)
    expect(await db.schema.hasTable('users')).toBe(false)
  })
})
