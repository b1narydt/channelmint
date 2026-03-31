import request from 'supertest'
import { createTestContext, type TestContext } from '../../../test/helpers.js'

describe('Analytics API', () => {
  let ctx: TestContext
  let apiKey: string
  let tenantId: string
  const userIdentityKey = '02' + 'cd'.repeat(32)
  const channelId = 'ch_test_001'
  const contentId = '/api/v1/generate'
  const now = Date.now()

  function makeEvent (overrides: Record<string, unknown> = {}) {
    return {
      eventType: 'channel.updated',
      channelId,
      consumerIdentityKey: userIdentityKey,
      contentId,
      payload: { satoshisPaid: 100, sequence: 1 },
      timestamp: now,
      ...overrides
    }
  }

  beforeEach(async () => {
    ctx = await createTestContext()

    // Register tenant
    const tenantRes = await request(ctx.app)
      .post('/v1/tenants')
      .send({
        name: 'Analytics Test Co',
        email: 'analytics@test.com',
        bsvIdentityKey: '02' + 'ab'.repeat(32)
      })
    apiKey = tenantRes.body.apiKey
    tenantId = tenantRes.body.tenant.id

    // Register user
    await request(ctx.app)
      .post('/v1/users')
      .set('x-bsv-identity-key', userIdentityKey)
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  // --- Event ingestion ---
  describe('POST /v1/analytics/events', () => {
    test('ingests events and returns count', async () => {
      const res = await request(ctx.app)
        .post('/v1/analytics/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          events: [
            makeEvent({ eventType: 'channel.opened', payload: {} }),
            makeEvent({ eventType: 'channel.updated', payload: { satoshisPaid: 50, sequence: 1 } }),
            makeEvent({ eventType: 'channel.updated', payload: { satoshisPaid: 75, sequence: 2 } })
          ]
        })
      expect(res.status).toBe(200)
      expect(res.body.ingested).toBe(3)
    })

    test('returns 0 for empty events array', async () => {
      const res = await request(ctx.app)
        .post('/v1/analytics/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ events: [] })
      expect(res.status).toBe(200)
      expect(res.body.ingested).toBe(0)
    })

    test('requires auth', async () => {
      const res = await request(ctx.app)
        .post('/v1/analytics/events')
        .send({ events: [makeEvent()] })
      expect(res.status).toBe(401)
    })
  })

  // --- Deduplication ---
  describe('deduplication', () => {
    test('deduplicates channel.opened by channelId + eventType', async () => {
      const event = makeEvent({ eventType: 'channel.opened', payload: {} })

      await request(ctx.app)
        .post('/v1/analytics/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ events: [event] })

      const res = await request(ctx.app)
        .post('/v1/analytics/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ events: [event] })

      expect(res.body.ingested).toBe(0)
    })

    test('deduplicates channel.closed by channelId + eventType', async () => {
      const event = makeEvent({ eventType: 'channel.closed', payload: {} })

      await request(ctx.app)
        .post('/v1/analytics/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ events: [event] })

      const res = await request(ctx.app)
        .post('/v1/analytics/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ events: [event] })

      expect(res.body.ingested).toBe(0)
    })

    test('deduplicates channel.updated by channelId + eventType + sequence', async () => {
      const event = makeEvent({
        eventType: 'channel.updated',
        payload: { satoshisPaid: 100, sequence: 5 }
      })

      await request(ctx.app)
        .post('/v1/analytics/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ events: [event] })

      const res = await request(ctx.app)
        .post('/v1/analytics/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ events: [event] })

      expect(res.body.ingested).toBe(0)
    })

    test('allows different sequences for channel.updated', async () => {
      await request(ctx.app)
        .post('/v1/analytics/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          events: [makeEvent({ payload: { satoshisPaid: 100, sequence: 1 } })]
        })

      const res = await request(ctx.app)
        .post('/v1/analytics/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          events: [makeEvent({ payload: { satoshisPaid: 200, sequence: 2 } })]
        })

      expect(res.body.ingested).toBe(1)
    })
  })

  // --- Batch endpoint ---
  describe('POST /v1/analytics/events/batch', () => {
    test('ingests events via batch endpoint', async () => {
      const res = await request(ctx.app)
        .post('/v1/analytics/events/batch')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          events: [
            makeEvent({ eventType: 'channel.opened', payload: {} }),
            makeEvent({ eventType: 'channel.updated', payload: { satoshisPaid: 50, sequence: 1 } })
          ]
        })
      expect(res.status).toBe(200)
      expect(res.body.ingested).toBe(2)
    })
  })

  // --- Revenue ---
  describe('GET /v1/analytics/revenue', () => {
    test('returns aggregated satoshis by period', async () => {
      await request(ctx.app)
        .post('/v1/analytics/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          events: [
            makeEvent({ eventType: 'channel.updated', payload: { satoshisPaid: 100, sequence: 1 } }),
            makeEvent({ eventType: 'channel.updated', payload: { satoshisPaid: 200, sequence: 2 } })
          ]
        })

      const res = await request(ctx.app)
        .get('/v1/analytics/revenue')
        .set('Authorization', `Bearer ${apiKey}`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].totalSatoshis).toBe(300)
      expect(res.body[0].period).toBeDefined()
    })

    test('returns empty array when no data', async () => {
      const res = await request(ctx.app)
        .get('/v1/analytics/revenue')
        .set('Authorization', `Bearer ${apiKey}`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(0)
    })

    test('requires auth', async () => {
      const res = await request(ctx.app).get('/v1/analytics/revenue')
      expect(res.status).toBe(401)
    })
  })

  // --- Usage ---
  describe('GET /v1/analytics/usage', () => {
    test('returns request counts and channel counts by period', async () => {
      await request(ctx.app)
        .post('/v1/analytics/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          events: [
            makeEvent({ eventType: 'channel.opened', payload: {} }),
            makeEvent({ eventType: 'channel.updated', payload: { satoshisPaid: 100, sequence: 1 } }),
            makeEvent({ eventType: 'channel.updated', payload: { satoshisPaid: 200, sequence: 2 } })
          ]
        })

      const res = await request(ctx.app)
        .get('/v1/analytics/usage')
        .set('Authorization', `Bearer ${apiKey}`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].totalRequests).toBe(2)
      expect(res.body[0].channelCount).toBe(1)
    })

    test('requires auth', async () => {
      const res = await request(ctx.app).get('/v1/analytics/usage')
      expect(res.status).toBe(401)
    })
  })

  // --- channel.opened increments channel_count ---
  describe('channel.opened events', () => {
    test('increment channel_count in usage summary', async () => {
      await request(ctx.app)
        .post('/v1/analytics/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          events: [
            makeEvent({ eventType: 'channel.opened', channelId: 'ch_1', payload: {} }),
            makeEvent({ eventType: 'channel.opened', channelId: 'ch_2', payload: {} })
          ]
        })

      const res = await request(ctx.app)
        .get('/v1/analytics/usage')
        .set('Authorization', `Bearer ${apiKey}`)

      expect(res.body[0].channelCount).toBe(2)
    })
  })

  // --- channel.updated increments totals ---
  describe('channel.updated events', () => {
    test('increment total_requests and total_satoshis_paid', async () => {
      await request(ctx.app)
        .post('/v1/analytics/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          events: [
            makeEvent({ channelId: 'ch_a', payload: { satoshisPaid: 50, sequence: 1 } }),
            makeEvent({ channelId: 'ch_a', payload: { satoshisPaid: 75, sequence: 2 } }),
            makeEvent({ channelId: 'ch_b', payload: { satoshisPaid: 25, sequence: 1 } })
          ]
        })

      const res = await request(ctx.app)
        .get('/v1/analytics/revenue')
        .set('Authorization', `Bearer ${apiKey}`)

      expect(res.body[0].totalSatoshis).toBe(150)

      const usageRes = await request(ctx.app)
        .get('/v1/analytics/usage')
        .set('Authorization', `Bearer ${apiKey}`)

      expect(usageRes.body[0].totalRequests).toBe(3)
    })
  })

  // --- Per-user spending ---
  describe('GET /v1/analytics/users/:identityKey', () => {
    test('returns per-user spending', async () => {
      await request(ctx.app)
        .post('/v1/analytics/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          events: [
            makeEvent({ eventType: 'channel.updated', payload: { satoshisPaid: 100, sequence: 1 } })
          ]
        })

      const res = await request(ctx.app)
        .get(`/v1/analytics/users/${userIdentityKey}`)
        .set('Authorization', `Bearer ${apiKey}`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].consumerIdentityKey).toBe(userIdentityKey)
      expect(res.body[0].totalSatoshisPaid).toBe(100)
      expect(res.body[0].totalRequests).toBe(1)
    })

    test('returns empty array for unknown user', async () => {
      const res = await request(ctx.app)
        .get(`/v1/analytics/users/${'02' + 'ff'.repeat(32)}`)
        .set('Authorization', `Bearer ${apiKey}`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(0)
    })

    test('requires auth', async () => {
      const res = await request(ctx.app)
        .get(`/v1/analytics/users/${userIdentityKey}`)
      expect(res.status).toBe(401)
    })
  })

  // --- User /me/spending ---
  describe('GET /v1/analytics/me/spending', () => {
    test('returns spending across tenants for authenticated user', async () => {
      await request(ctx.app)
        .post('/v1/analytics/events')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          events: [
            makeEvent({ eventType: 'channel.updated', payload: { satoshisPaid: 200, sequence: 1 } })
          ]
        })

      const res = await request(ctx.app)
        .get('/v1/analytics/me/spending')
        .set('x-bsv-identity-key', userIdentityKey)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].totalSatoshisPaid).toBe(200)
      expect(res.body[0].tenantId).toBe(tenantId)
    })

    test('requires user auth', async () => {
      const res = await request(ctx.app)
        .get('/v1/analytics/me/spending')
      expect(res.status).toBe(401)
    })

    test('rejects invalid identity key', async () => {
      const res = await request(ctx.app)
        .get('/v1/analytics/me/spending')
        .set('x-bsv-identity-key', 'invalid')
      expect(res.status).toBe(401)
    })
  })

  // --- Auth requirements ---
  describe('auth requirements', () => {
    test('requires auth for all tenant routes', async () => {
      const routes = [
        { method: 'post', path: '/v1/analytics/events' },
        { method: 'post', path: '/v1/analytics/events/batch' },
        { method: 'get', path: '/v1/analytics/revenue' },
        { method: 'get', path: '/v1/analytics/usage' },
        { method: 'get', path: `/v1/analytics/users/${userIdentityKey}` }
      ]

      for (const route of routes) {
        const res = await (request(ctx.app) as any)[route.method](route.path)
        expect(res.status).toBe(401)
      }
    })
  })
})
