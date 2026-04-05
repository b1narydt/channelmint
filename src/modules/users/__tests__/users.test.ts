import request from 'supertest'
import { createTestContext, type TestContext } from '../../../test/helpers.js'

describe('Users API', () => {
  let ctx: TestContext
  const validIdentityKey = '02' + 'ab'.repeat(32)

  beforeEach(async () => {
    ctx = await createTestContext()
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  describe('POST /v1/users', () => {
    test('registers a new user with identity key', async () => {
      const res = await request(ctx.app)
        .post('/v1/users')
        .set('x-bsv-identity-key', validIdentityKey)
      expect(res.status).toBe(201)
      expect(res.body.id).toBeDefined()
      expect(res.body.bsvIdentityKey).toBe(validIdentityKey)
      expect(res.body.status).toBe('active')
    })

    test('returns existing user on duplicate registration', async () => {
      const res1 = await request(ctx.app)
        .post('/v1/users')
        .set('x-bsv-identity-key', validIdentityKey)
      const res2 = await request(ctx.app)
        .post('/v1/users')
        .set('x-bsv-identity-key', validIdentityKey)
      expect(res2.status).toBe(200)
      expect(res2.body.id).toBe(res1.body.id)
    })

    test('rejects missing identity key', async () => {
      const res = await request(ctx.app).post('/v1/users')
      expect(res.status).toBe(401)
    })

    test('rejects invalid identity key format', async () => {
      const res = await request(ctx.app)
        .post('/v1/users')
        .set('x-bsv-identity-key', 'not-valid')
      expect(res.status).toBe(401)
    })
  })

  describe('GET /v1/users/me', () => {
    test('returns user profile', async () => {
      await request(ctx.app)
        .post('/v1/users')
        .set('x-bsv-identity-key', validIdentityKey)
      const res = await request(ctx.app)
        .get('/v1/users/me')
        .set('x-bsv-identity-key', validIdentityKey)
      expect(res.status).toBe(200)
      expect(res.body.bsvIdentityKey).toBe(validIdentityKey)
    })

    test('rejects unregistered user', async () => {
      const res = await request(ctx.app)
        .get('/v1/users/me')
        .set('x-bsv-identity-key', '03' + 'ff'.repeat(32))
      expect(res.status).toBe(401)
    })
  })
})
