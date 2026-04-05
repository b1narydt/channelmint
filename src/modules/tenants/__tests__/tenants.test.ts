import request from 'supertest'
import { createTestContext, type TestContext } from '../../../test/helpers.js'

describe('Tenants API', () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await createTestContext()
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  describe('POST /v1/tenants', () => {
    test('registers a new tenant and returns API key', async () => {
      const res = await request(ctx.app)
        .post('/v1/tenants')
        .send({
          name: 'Acme Corp',
          email: 'admin@acme.com',
          bsvIdentityKey: '02' + 'ab'.repeat(32)
        })
      expect(res.status).toBe(201)
      expect(res.body.tenant.name).toBe('Acme Corp')
      expect(res.body.tenant.id).toBeDefined()
      expect(res.body.apiKey).toMatch(/^cm_/)
    })

    test('rejects duplicate email', async () => {
      const body = {
        name: 'Acme Corp',
        email: 'admin@acme.com',
        bsvIdentityKey: '02' + 'ab'.repeat(32)
      }
      await request(ctx.app).post('/v1/tenants').send(body)
      const res = await request(ctx.app)
        .post('/v1/tenants')
        .send({ ...body, bsvIdentityKey: '03' + 'cd'.repeat(32) })
      expect(res.status).toBe(409)
    })

    test('rejects missing required fields', async () => {
      const res = await request(ctx.app)
        .post('/v1/tenants')
        .send({ name: 'Acme Corp' })
      expect(res.status).toBe(400)
    })

    test('rejects invalid identity key format', async () => {
      const res = await request(ctx.app)
        .post('/v1/tenants')
        .send({
          name: 'Acme Corp',
          email: 'admin@acme.com',
          bsvIdentityKey: 'not-a-valid-key'
        })
      expect(res.status).toBe(400)
    })
  })

  describe('GET /v1/tenants/me', () => {
    let apiKey: string

    beforeEach(async () => {
      const res = await request(ctx.app)
        .post('/v1/tenants')
        .send({
          name: 'Acme Corp',
          email: 'admin@acme.com',
          bsvIdentityKey: '02' + 'ab'.repeat(32)
        })
      apiKey = res.body.apiKey
    })

    test('returns tenant profile with valid API key', async () => {
      const res = await request(ctx.app)
        .get('/v1/tenants/me')
        .set('Authorization', `Bearer ${apiKey}`)
      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Acme Corp')
    })

    test('rejects without auth', async () => {
      const res = await request(ctx.app).get('/v1/tenants/me')
      expect(res.status).toBe(401)
    })
  })

  describe('PATCH /v1/tenants/me', () => {
    let apiKey: string

    beforeEach(async () => {
      const res = await request(ctx.app)
        .post('/v1/tenants')
        .send({
          name: 'Acme Corp',
          email: 'admin@acme.com',
          bsvIdentityKey: '02' + 'ab'.repeat(32)
        })
      apiKey = res.body.apiKey
    })

    test('updates tenant profile', async () => {
      const res = await request(ctx.app)
        .patch('/v1/tenants/me')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ channelEndpointUrl: 'https://api.acme.com/channels' })
      expect(res.status).toBe(200)
      expect(res.body.channelEndpointUrl).toBe('https://api.acme.com/channels')
    })
  })

  describe('POST /v1/tenants/me/api-keys', () => {
    let apiKey: string

    beforeEach(async () => {
      const res = await request(ctx.app)
        .post('/v1/tenants')
        .send({
          name: 'Acme Corp',
          email: 'admin@acme.com',
          bsvIdentityKey: '02' + 'ab'.repeat(32)
        })
      apiKey = res.body.apiKey
    })

    test('creates additional API key', async () => {
      const res = await request(ctx.app)
        .post('/v1/tenants/me/api-keys')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ label: 'Read-only key', scopes: ['billing:read'] })
      expect(res.status).toBe(201)
      expect(res.body.apiKey).toMatch(/^cm_/)
      expect(res.body.label).toBe('Read-only key')
    })
  })

  describe('DELETE /v1/tenants/me/api-keys/:id', () => {
    let apiKey: string

    beforeEach(async () => {
      const res = await request(ctx.app)
        .post('/v1/tenants')
        .send({
          name: 'Acme Corp',
          email: 'admin@acme.com',
          bsvIdentityKey: '02' + 'ab'.repeat(32)
        })
      apiKey = res.body.apiKey
    })

    test('revokes an API key', async () => {
      const createRes = await request(ctx.app)
        .post('/v1/tenants/me/api-keys')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ label: 'Temp key', scopes: ['billing:read'] })
      const keyId = createRes.body.id

      const res = await request(ctx.app)
        .delete(`/v1/tenants/me/api-keys/${keyId}`)
        .set('Authorization', `Bearer ${apiKey}`)
      expect(res.status).toBe(200)

      const verifyRes = await request(ctx.app)
        .get('/v1/tenants/me')
        .set('Authorization', `Bearer ${createRes.body.apiKey}`)
      expect(verifyRes.status).toBe(401)
    })
  })
})
