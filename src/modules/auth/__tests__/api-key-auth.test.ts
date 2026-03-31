import request from 'supertest'
import express from 'express'
import crypto from 'crypto'
import { v4 as uuid } from 'uuid'
import { createTestDatabase } from '../../../db/connection.js'
import { up as upTenants } from '../../../db/migrations/001_create_tenants.js'
import { up as upApiKeys } from '../../../db/migrations/002_create_api_keys.js'
import { createApiKeyAuth } from '../api-key-auth.js'
import { errorHandler } from '../../../shared/error-middleware.js'
import type { Knex } from 'knex'

describe('API Key Authentication', () => {
  let db: Knex
  let app: express.Express
  let validKey: string
  let tenantId: string

  beforeEach(async () => {
    db = createTestDatabase()
    await upTenants(db)
    await upApiKeys(db)

    tenantId = uuid()
    await db('tenants').insert({
      id: tenantId,
      name: 'Test Tenant',
      email: 'test@example.com',
      bsv_identity_key: '02' + 'ab'.repeat(32),
      status: 'active'
    })

    validKey = 'cm_test_' + crypto.randomBytes(24).toString('hex')
    const keyHash = crypto.createHash('sha256').update(validKey).digest('hex')
    await db('api_keys').insert({
      id: uuid(),
      tenant_id: tenantId,
      key_hash: keyHash,
      prefix: validKey.slice(0, 8),
      scopes: JSON.stringify(['billing:read', 'billing:write']),
      label: 'Test Key'
    })

    app = express()
    app.use(express.json())
    const auth = createApiKeyAuth(db)
    app.get('/protected', auth, (req: any, res: any) => {
      res.json({ tenantId: req.tenant.id, scopes: req.tenant.scopes })
    })
    app.use(errorHandler)
  })

  afterEach(async () => {
    await db.destroy()
  })

  test('authenticates with valid API key', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${validKey}`)
    expect(res.status).toBe(200)
    expect(res.body.tenantId).toBe(tenantId)
    expect(res.body.scopes).toContain('billing:read')
  })

  test('rejects missing Authorization header', async () => {
    const res = await request(app).get('/protected')
    expect(res.status).toBe(401)
  })

  test('rejects invalid API key', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer cm_test_invalid')
    expect(res.status).toBe(401)
  })

  test('rejects malformed Authorization header', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Basic abc123')
    expect(res.status).toBe(401)
  })

  test('rejects expired API key', async () => {
    const expiredKey = 'cm_exp_' + crypto.randomBytes(24).toString('hex')
    const keyHash = crypto.createHash('sha256').update(expiredKey).digest('hex')
    await db('api_keys').insert({
      id: uuid(),
      tenant_id: tenantId,
      key_hash: keyHash,
      prefix: expiredKey.slice(0, 8),
      scopes: JSON.stringify(['billing:read']),
      label: 'Expired Key',
      expires_at: new Date(Date.now() - 86400000).toISOString()
    })

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${expiredKey}`)
    expect(res.status).toBe(401)
  })
})
