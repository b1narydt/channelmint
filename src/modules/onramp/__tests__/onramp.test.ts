import request from 'supertest'
import { v4 as uuid } from 'uuid'
import { createTestContext, type TestContext } from '../../../test/helpers.js'

describe('Onramp API', () => {
  let ctx: TestContext
  const userKey = '02' + 'ee'.repeat(32)

  beforeEach(async () => {
    ctx = await createTestContext()
    // Register user
    await request(ctx.app)
      .post('/v1/users')
      .set('x-bsv-identity-key', userKey)
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  describe('POST /v1/onramp/session', () => {
    test('creates purchase and returns widget config', async () => {
      const res = await request(ctx.app)
        .post('/v1/onramp/session')
        .set('x-bsv-identity-key', userKey)
        .send({ receivingAddress: '1BitcoinSVAddress123' })

      expect(res.status).toBe(201)
      expect(res.body.purchase.status).toBe('pending')
      expect(res.body.purchase.targetAddress).toBe('1BitcoinSVAddress123')
      expect(res.body.widgetConfig.enabledCryptoAssets).toBe('BSV_BSV')
      expect(res.body.widgetConfig.userAddress).toBe('1BitcoinSVAddress123')
      expect(res.body.widgetConfig.purchaseId).toBeDefined()
    })

    test('rejects missing receivingAddress', async () => {
      const res = await request(ctx.app)
        .post('/v1/onramp/session')
        .set('x-bsv-identity-key', userKey)
        .send({})

      expect(res.status).toBe(400)
    })

    test('rejects unauthenticated request', async () => {
      const res = await request(ctx.app)
        .post('/v1/onramp/session')
        .send({ receivingAddress: '1addr' })

      expect(res.status).toBe(401)
    })
  })

  describe('GET /v1/onramp/purchases', () => {
    test('lists user purchases', async () => {
      await request(ctx.app)
        .post('/v1/onramp/session')
        .set('x-bsv-identity-key', userKey)
        .send({ receivingAddress: '1addr1' })

      await request(ctx.app)
        .post('/v1/onramp/session')
        .set('x-bsv-identity-key', userKey)
        .send({ receivingAddress: '1addr2' })

      const res = await request(ctx.app)
        .get('/v1/onramp/purchases')
        .set('x-bsv-identity-key', userKey)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
    })
  })

  describe('GET /v1/onramp/purchases/:id', () => {
    test('returns single purchase', async () => {
      const createRes = await request(ctx.app)
        .post('/v1/onramp/session')
        .set('x-bsv-identity-key', userKey)
        .send({ receivingAddress: '1addr' })

      const purchaseId = createRes.body.purchase.id

      const res = await request(ctx.app)
        .get(`/v1/onramp/purchases/${purchaseId}`)
        .set('x-bsv-identity-key', userKey)

      expect(res.status).toBe(200)
      expect(res.body.id).toBe(purchaseId)
    })

    test('returns 404 for unknown purchase', async () => {
      const res = await request(ctx.app)
        .get(`/v1/onramp/purchases/${uuid()}`)
        .set('x-bsv-identity-key', userKey)

      expect(res.status).toBe(404)
    })
  })

  describe('POST /v1/onramp/webhooks/ramp', () => {
    test('updates purchase status on RELEASED', async () => {
      const createRes = await request(ctx.app)
        .post('/v1/onramp/session')
        .set('x-bsv-identity-key', userKey)
        .send({ receivingAddress: '1addr' })

      const purchaseId = createRes.body.purchase.id

      const webhookRes = await request(ctx.app)
        .post('/v1/onramp/webhooks/ramp')
        .send({
          type: 'RELEASED',
          purchase: { id: purchaseId, cryptoAmount: '0.5' }
        })

      expect(webhookRes.status).toBe(200)

      const getRes = await request(ctx.app)
        .get(`/v1/onramp/purchases/${purchaseId}`)
        .set('x-bsv-identity-key', userKey)

      expect(getRes.body.status).toBe('released')
      expect(getRes.body.bsvAmount).toBe(0.5)
    })

    test('updates purchase status on RETURNED', async () => {
      const createRes = await request(ctx.app)
        .post('/v1/onramp/session')
        .set('x-bsv-identity-key', userKey)
        .send({ receivingAddress: '1addr' })

      const purchaseId = createRes.body.purchase.id

      await request(ctx.app)
        .post('/v1/onramp/webhooks/ramp')
        .send({
          type: 'RETURNED',
          purchase: { id: purchaseId }
        })

      const getRes = await request(ctx.app)
        .get(`/v1/onramp/purchases/${purchaseId}`)
        .set('x-bsv-identity-key', userKey)

      expect(getRes.body.status).toBe('returned')
    })

    test('ignores unknown purchase IDs gracefully', async () => {
      const res = await request(ctx.app)
        .post('/v1/onramp/webhooks/ramp')
        .send({
          type: 'RELEASED',
          purchase: { id: uuid() }
        })

      expect(res.status).toBe(200)
    })
  })
})
