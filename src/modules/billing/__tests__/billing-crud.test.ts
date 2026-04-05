import request from 'supertest'
import { createTestContext, type TestContext } from '../../../test/helpers.js'

describe('Billing CRUD API', () => {
  let ctx: TestContext
  let apiKey: string

  beforeEach(async () => {
    ctx = await createTestContext()
    const res = await request(ctx.app)
      .post('/v1/tenants')
      .send({
        name: 'Billing Test Co',
        email: 'billing@test.com',
        bsvIdentityKey: '02' + 'ab'.repeat(32)
      })
    apiKey = res.body.apiKey
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  // --- Products ---
  describe('POST /v1/billing/products', () => {
    test('creates a product', async () => {
      const res = await request(ctx.app)
        .post('/v1/billing/products')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'AI Tokens', unitName: 'token' })
      expect(res.status).toBe(201)
      expect(res.body.name).toBe('AI Tokens')
      expect(res.body.unitName).toBe('token')
      expect(res.body.status).toBe('active')
      expect(res.body.id).toBeDefined()
    })

    test('rejects missing fields', async () => {
      const res = await request(ctx.app)
        .post('/v1/billing/products')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'AI Tokens' })
      expect(res.status).toBe(400)
    })
  })

  describe('GET /v1/billing/products', () => {
    test('lists products', async () => {
      await request(ctx.app)
        .post('/v1/billing/products')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Product A', unitName: 'unit' })
      await request(ctx.app)
        .post('/v1/billing/products')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Product B', unitName: 'call' })

      const res = await request(ctx.app)
        .get('/v1/billing/products')
        .set('Authorization', `Bearer ${apiKey}`)
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
    })
  })

  describe('PATCH /v1/billing/products/:id', () => {
    test('archives a product', async () => {
      const created = await request(ctx.app)
        .post('/v1/billing/products')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'To Archive', unitName: 'unit' })

      const res = await request(ctx.app)
        .patch(`/v1/billing/products/${created.body.id}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ status: 'archived' })
      expect(res.status).toBe(200)
      expect(res.body.status).toBe('archived')

      // Archived product should not appear in list
      const list = await request(ctx.app)
        .get('/v1/billing/products')
        .set('Authorization', `Bearer ${apiKey}`)
      expect(list.body).toHaveLength(0)
    })
  })

  // --- Rate Cards ---
  describe('POST /v1/billing/rate-cards', () => {
    test('creates a rate card', async () => {
      const res = await request(ctx.app)
        .post('/v1/billing/rate-cards')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Standard', description: 'Default pricing' })
      expect(res.status).toBe(201)
      expect(res.body.name).toBe('Standard')
      expect(res.body.description).toBe('Default pricing')
    })
  })

  describe('GET /v1/billing/rate-cards', () => {
    test('lists rate cards', async () => {
      await request(ctx.app)
        .post('/v1/billing/rate-cards')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Card A' })

      const res = await request(ctx.app)
        .get('/v1/billing/rate-cards')
        .set('Authorization', `Bearer ${apiKey}`)
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
    })
  })

  // --- Rates ---
  describe('POST /v1/billing/rate-cards/:id/rates', () => {
    test('adds a rate to a rate card', async () => {
      const product = await request(ctx.app)
        .post('/v1/billing/products')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Tokens', unitName: 'token' })
      const rc = await request(ctx.app)
        .post('/v1/billing/rate-cards')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Standard' })

      const res = await request(ctx.app)
        .post(`/v1/billing/rate-cards/${rc.body.id}/rates`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          productId: product.body.id,
          pricePerUnit: 100,
          effectiveAt: '2025-01-01T00:00:00.000Z'
        })
      expect(res.status).toBe(201)
      expect(res.body.pricePerUnit).toBe(100)
      expect(res.body.rateCardId).toBe(rc.body.id)
    })
  })

  describe('GET /v1/billing/rate-cards/:id/rates', () => {
    test('lists rates for a rate card', async () => {
      const product = await request(ctx.app)
        .post('/v1/billing/products')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Tokens', unitName: 'token' })
      const rc = await request(ctx.app)
        .post('/v1/billing/rate-cards')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Standard' })

      await request(ctx.app)
        .post(`/v1/billing/rate-cards/${rc.body.id}/rates`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          productId: product.body.id,
          pricePerUnit: 100,
          effectiveAt: '2025-01-01T00:00:00.000Z'
        })

      const res = await request(ctx.app)
        .get(`/v1/billing/rate-cards/${rc.body.id}/rates`)
        .set('Authorization', `Bearer ${apiKey}`)
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
    })
  })

  // --- Content Pricing ---
  describe('POST /v1/billing/content-pricing', () => {
    test('creates a content pricing rule', async () => {
      const product = await request(ctx.app)
        .post('/v1/billing/products')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Tokens', unitName: 'token' })
      const rc = await request(ctx.app)
        .post('/v1/billing/rate-cards')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Standard' })

      const res = await request(ctx.app)
        .post('/v1/billing/content-pricing')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          rateCardId: rc.body.id,
          contentPattern: '/api/v1/generate',
          productId: product.body.id,
          recipients: [{ name: 'Platform', percentage: 100 }]
        })
      expect(res.status).toBe(201)
      expect(res.body.contentPattern).toBe('/api/v1/generate')
      expect(res.body.recipients).toHaveLength(1)
    })

    test('rejects bad percentages (not summing to 100)', async () => {
      const product = await request(ctx.app)
        .post('/v1/billing/products')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Tokens', unitName: 'token' })
      const rc = await request(ctx.app)
        .post('/v1/billing/rate-cards')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Standard' })

      const res = await request(ctx.app)
        .post('/v1/billing/content-pricing')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          rateCardId: rc.body.id,
          contentPattern: '/api/v1/generate',
          productId: product.body.id,
          recipients: [
            { name: 'Platform', percentage: 60 },
            { name: 'Creator', percentage: 30 }
          ]
        })
      expect(res.status).toBe(400)
    })
  })

  describe('GET /v1/billing/content-pricing', () => {
    test('lists content pricing rules', async () => {
      const product = await request(ctx.app)
        .post('/v1/billing/products')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Tokens', unitName: 'token' })
      const rc = await request(ctx.app)
        .post('/v1/billing/rate-cards')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Standard' })

      await request(ctx.app)
        .post('/v1/billing/content-pricing')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          rateCardId: rc.body.id,
          contentPattern: '/api/v1/*',
          productId: product.body.id,
          recipients: [{ name: 'Platform', percentage: 100 }]
        })

      const res = await request(ctx.app)
        .get('/v1/billing/content-pricing')
        .set('Authorization', `Bearer ${apiKey}`)
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
    })
  })

  // --- Auth ---
  describe('auth requirements', () => {
    test('requires auth for all billing routes', async () => {
      const routes = [
        { method: 'get', path: '/v1/billing/products' },
        { method: 'post', path: '/v1/billing/products' },
        { method: 'get', path: '/v1/billing/rate-cards' },
        { method: 'post', path: '/v1/billing/rate-cards' },
        { method: 'get', path: '/v1/billing/content-pricing' },
        { method: 'post', path: '/v1/billing/content-pricing' },
        { method: 'get', path: '/v1/billing/config/test' }
      ]

      for (const route of routes) {
        const res = await (request(ctx.app) as any)[route.method](route.path)
        expect(res.status).toBe(401)
      }
    })
  })
})
