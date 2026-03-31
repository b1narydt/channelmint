import request from 'supertest'
import { createTestContext, type TestContext } from '../../../test/helpers.js'

describe('Config Resolution API (GET /v1/billing/config/:contentId)', () => {
  let ctx: TestContext
  let apiKey: string

  async function setupPricingFixture (options?: { priority?: number; contentPattern?: string; pricePerUnit?: number; effectiveAt?: string }) {
    const product = await request(ctx.app)
      .post('/v1/billing/products')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ name: 'AI Tokens', unitName: 'token' })

    const rc = await request(ctx.app)
      .post('/v1/billing/rate-cards')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ name: 'Standard' })

    await request(ctx.app)
      .post(`/v1/billing/rate-cards/${rc.body.id}/rates`)
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        productId: product.body.id,
        pricePerUnit: options?.pricePerUnit ?? 100,
        effectiveAt: options?.effectiveAt ?? '2025-01-01T00:00:00.000Z'
      })

    await request(ctx.app)
      .post('/v1/billing/content-pricing')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        rateCardId: rc.body.id,
        contentPattern: options?.contentPattern ?? '/api/v1/generate',
        productId: product.body.id,
        recipients: [
          { name: 'Platform', percentage: 70 },
          { name: 'Creator', percentage: 30 }
        ],
        priority: options?.priority ?? 0
      })

    return { product: product.body, rateCard: rc.body }
  }

  beforeEach(async () => {
    ctx = await createTestContext()
    const res = await request(ctx.app)
      .post('/v1/tenants')
      .send({
        name: 'Config Test Co',
        email: 'config@test.com',
        bsvIdentityKey: '02' + 'cd'.repeat(32)
      })
    apiKey = res.body.apiKey
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  test('returns ChannelConfig for exact content match', async () => {
    await setupPricingFixture({ contentPattern: '/api/v1/generate' })

    const res = await request(ctx.app)
      .get('/v1/billing/config/%2Fapi%2Fv1%2Fgenerate')
      .set('Authorization', `Bearer ${apiKey}`)

    expect(res.status).toBe(200)
    expect(res.body.chunkPrice).toBe(100)
    expect(res.body.recipients).toHaveLength(2)
    expect(res.body.recipients[0].name).toBe('Platform')
    expect(res.body.recipients[0].percentage).toBe(70)
  })

  test('returns ChannelConfig for glob pattern match', async () => {
    await setupPricingFixture({ contentPattern: '/api/v1/*' })

    const res = await request(ctx.app)
      .get('/v1/billing/config/%2Fapi%2Fv1%2Fgenerate')
      .set('Authorization', `Bearer ${apiKey}`)

    expect(res.status).toBe(200)
    expect(res.body.chunkPrice).toBe(100)
    expect(res.body.recipients).toHaveLength(2)
  })

  test('returns 404 when no pricing rule matches', async () => {
    await setupPricingFixture({ contentPattern: '/api/v1/generate' })

    const res = await request(ctx.app)
      .get('/v1/billing/config/%2Fapi%2Fv2%2Fsomething')
      .set('Authorization', `Bearer ${apiKey}`)

    expect(res.status).toBe(404)
  })

  test('higher priority rules take precedence', async () => {
    // Create a low-priority glob rule
    const product1 = await request(ctx.app)
      .post('/v1/billing/products')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ name: 'Cheap Tokens', unitName: 'token' })
    const rc1 = await request(ctx.app)
      .post('/v1/billing/rate-cards')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ name: 'Budget' })
    await request(ctx.app)
      .post(`/v1/billing/rate-cards/${rc1.body.id}/rates`)
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        productId: product1.body.id,
        pricePerUnit: 50,
        effectiveAt: '2025-01-01T00:00:00.000Z'
      })
    await request(ctx.app)
      .post('/v1/billing/content-pricing')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        rateCardId: rc1.body.id,
        contentPattern: '/api/v1/*',
        productId: product1.body.id,
        recipients: [{ name: 'Platform', percentage: 100 }],
        priority: 1
      })

    // Create a high-priority exact rule
    const product2 = await request(ctx.app)
      .post('/v1/billing/products')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ name: 'Premium Tokens', unitName: 'token' })
    const rc2 = await request(ctx.app)
      .post('/v1/billing/rate-cards')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ name: 'Premium' })
    await request(ctx.app)
      .post(`/v1/billing/rate-cards/${rc2.body.id}/rates`)
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        productId: product2.body.id,
        pricePerUnit: 200,
        effectiveAt: '2025-01-01T00:00:00.000Z'
      })
    await request(ctx.app)
      .post('/v1/billing/content-pricing')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        rateCardId: rc2.body.id,
        contentPattern: '/api/v1/generate',
        productId: product2.body.id,
        recipients: [{ name: 'Premium Platform', percentage: 100 }],
        priority: 10
      })

    const res = await request(ctx.app)
      .get('/v1/billing/config/%2Fapi%2Fv1%2Fgenerate')
      .set('Authorization', `Bearer ${apiKey}`)

    expect(res.status).toBe(200)
    expect(res.body.chunkPrice).toBe(200)
    expect(res.body.recipients[0].name).toBe('Premium Platform')
  })

  test('uses most recent effective rate (not future-dated)', async () => {
    const product = await request(ctx.app)
      .post('/v1/billing/products')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ name: 'Tokens', unitName: 'token' })
    const rc = await request(ctx.app)
      .post('/v1/billing/rate-cards')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ name: 'Standard' })

    // Old rate
    await request(ctx.app)
      .post(`/v1/billing/rate-cards/${rc.body.id}/rates`)
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        productId: product.body.id,
        pricePerUnit: 50,
        effectiveAt: '2024-01-01T00:00:00.000Z'
      })

    // Current rate (most recent past)
    await request(ctx.app)
      .post(`/v1/billing/rate-cards/${rc.body.id}/rates`)
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        productId: product.body.id,
        pricePerUnit: 150,
        effectiveAt: '2025-06-01T00:00:00.000Z'
      })

    // Future rate (should not be used)
    await request(ctx.app)
      .post(`/v1/billing/rate-cards/${rc.body.id}/rates`)
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        productId: product.body.id,
        pricePerUnit: 999,
        effectiveAt: '2099-01-01T00:00:00.000Z'
      })

    await request(ctx.app)
      .post('/v1/billing/content-pricing')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        rateCardId: rc.body.id,
        contentPattern: '/api/v1/generate',
        productId: product.body.id,
        recipients: [{ name: 'Platform', percentage: 100 }]
      })

    const res = await request(ctx.app)
      .get('/v1/billing/config/%2Fapi%2Fv1%2Fgenerate')
      .set('Authorization', `Bearer ${apiKey}`)

    expect(res.status).toBe(200)
    expect(res.body.chunkPrice).toBe(150)
  })

  test('requires auth', async () => {
    const res = await request(ctx.app)
      .get('/v1/billing/config/test')

    expect(res.status).toBe(401)
  })
})
