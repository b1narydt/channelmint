import request from 'supertest'
import { createTestContext, type TestContext } from '../test/helpers.js'

describe('App', () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await createTestContext()
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  test('GET /health returns 200', async () => {
    const res = await request(ctx.app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  test('GET /nonexistent returns 404', async () => {
    const res = await request(ctx.app).get('/nonexistent')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})
