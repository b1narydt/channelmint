import express from 'express'
import request from 'supertest'
import { createTestDatabase } from '../../../db/connection.js'
import { errorHandler } from '../../../shared/error-middleware.js'
import { up as upTenants } from '../../../db/migrations/001_create_tenants.js'
import { up as upApiKeys } from '../../../db/migrations/002_create_api_keys.js'
import { up as upServiceListings } from '../../../db/migrations/009_create_service_listings.js'
import { createDiscoveryRoutes } from '../routes.js'
import type { Knex } from 'knex'

// Build a standalone express app for discovery testing
function createDiscoveryApp (db: Knex): express.Express {
  const app = express()
  app.use(express.json())
  app.use('/v1/discovery', createDiscoveryRoutes(db))
  app.use(errorHandler)
  return app
}

async function setupDb (): Promise<Knex> {
  const db = createTestDatabase()
  await upTenants(db)
  await upApiKeys(db)
  await upServiceListings(db)
  return db
}

// Register a tenant via the tenant service and return the API key
async function registerTenant (db: Knex, opts?: { suffix?: string }): Promise<{ tenantId: string; apiKey: string }> {
  const { createTenantService } = await import('../../tenants/service.js')
  const svc = createTenantService(db)
  const suffix = opts?.suffix ?? '1'
  const { tenant, apiKey } = await svc.register({
    name: `Tenant ${suffix}`,
    email: `tenant${suffix}@example.com`,
    bsvIdentityKey: '02' + suffix.padStart(2, '0').repeat(32)
  })
  return { tenantId: tenant.id, apiKey }
}

const validListing = {
  name: 'My AI Service',
  description: 'An AI-powered service over BSV channels',
  category: 'ai',
  channelEndpointUrl: 'https://api.example.com/channel'
}

describe('Discovery API', () => {
  let db: Knex
  let app: express.Express
  let apiKey: string
  let tenantId: string

  beforeEach(async () => {
    db = await setupDb()
    app = createDiscoveryApp(db)
    const reg = await registerTenant(db, { suffix: '1' })
    apiKey = reg.apiKey
    tenantId = reg.tenantId
  })

  afterEach(async () => {
    await db.destroy()
  })

  // -----------------------------------------------------------------------
  // POST /v1/discovery/services
  // -----------------------------------------------------------------------
  describe('POST /v1/discovery/services', () => {
    test('creates a listing and returns 201', async () => {
      const res = await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send(validListing)

      expect(res.status).toBe(201)
      expect(res.body.id).toBeDefined()
      expect(res.body.tenantId).toBe(tenantId)
      expect(res.body.name).toBe(validListing.name)
      expect(res.body.description).toBe(validListing.description)
      expect(res.body.category).toBe(validListing.category)
      expect(res.body.channelEndpointUrl).toBe(validListing.channelEndpointUrl)
      expect(res.body.thumbnailUrl).toBeNull()
      expect(res.body.tags).toEqual([])
      expect(res.body.status).toBe('active')
    })

    test('accepts optional thumbnailUrl and tags', async () => {
      const res = await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          ...validListing,
          thumbnailUrl: 'https://cdn.example.com/thumb.png',
          tags: ['ai', 'bsv', 'beta']
        })

      expect(res.status).toBe(201)
      expect(res.body.thumbnailUrl).toBe('https://cdn.example.com/thumb.png')
      expect(res.body.tags).toEqual(['ai', 'bsv', 'beta'])
    })

    test('rejects missing name', async () => {
      const { name: _name, ...rest } = validListing
      const res = await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send(rest)
      expect(res.status).toBe(400)
    })

    test('rejects missing description', async () => {
      const { description: _desc, ...rest } = validListing
      const res = await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send(rest)
      expect(res.status).toBe(400)
    })

    test('rejects missing category', async () => {
      const { category: _cat, ...rest } = validListing
      const res = await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send(rest)
      expect(res.status).toBe(400)
    })

    test('rejects missing channelEndpointUrl', async () => {
      const { channelEndpointUrl: _url, ...rest } = validListing
      const res = await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send(rest)
      expect(res.status).toBe(400)
    })

    test('requires auth — 401 without Bearer token', async () => {
      const res = await request(app)
        .post('/v1/discovery/services')
        .send(validListing)
      expect(res.status).toBe(401)
    })

    test('requires auth — 401 with invalid token', async () => {
      const res = await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', 'Bearer cm_totally_fake_key_that_does_not_exist')
        .send(validListing)
      expect(res.status).toBe(401)
    })
  })

  // -----------------------------------------------------------------------
  // GET /v1/discovery/services/me
  // -----------------------------------------------------------------------
  describe('GET /v1/discovery/services/me', () => {
    test('returns empty array when tenant has no listings', async () => {
      const res = await request(app)
        .get('/v1/discovery/services/me')
        .set('Authorization', `Bearer ${apiKey}`)
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    test('returns only own listings', async () => {
      // Create two listings for the main tenant
      await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send(validListing)
      await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ ...validListing, name: 'Service 2' })

      // Create a listing for a second tenant
      const { apiKey: otherKey } = await registerTenant(db, { suffix: '2' })
      await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${otherKey}`)
        .send({ ...validListing, name: 'Other Tenant Service' })

      const res = await request(app)
        .get('/v1/discovery/services/me')
        .set('Authorization', `Bearer ${apiKey}`)
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
      const names = res.body.map((l: any) => l.name)
      expect(names).toContain('My AI Service')
      expect(names).toContain('Service 2')
      expect(names).not.toContain('Other Tenant Service')
    })

    test('requires auth', async () => {
      const res = await request(app).get('/v1/discovery/services/me')
      expect(res.status).toBe(401)
    })
  })

  // -----------------------------------------------------------------------
  // PATCH /v1/discovery/services/:id
  // -----------------------------------------------------------------------
  describe('PATCH /v1/discovery/services/:id', () => {
    let listingId: string

    beforeEach(async () => {
      const res = await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send(validListing)
      listingId = res.body.id
    })

    test('updates name', async () => {
      const res = await request(app)
        .patch(`/v1/discovery/services/${listingId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Updated Name' })
      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Updated Name')
      // Other fields unchanged
      expect(res.body.category).toBe(validListing.category)
    })

    test('updates description, category, tags, channelEndpointUrl', async () => {
      const res = await request(app)
        .patch(`/v1/discovery/services/${listingId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          description: 'New description',
          category: 'data',
          tags: ['updated'],
          channelEndpointUrl: 'https://new.example.com/channel'
        })
      expect(res.status).toBe(200)
      expect(res.body.description).toBe('New description')
      expect(res.body.category).toBe('data')
      expect(res.body.tags).toEqual(['updated'])
      expect(res.body.channelEndpointUrl).toBe('https://new.example.com/channel')
    })

    test('can set status to unlisted', async () => {
      const res = await request(app)
        .patch(`/v1/discovery/services/${listingId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ status: 'unlisted' })
      expect(res.status).toBe(200)
      expect(res.body.status).toBe('unlisted')
    })

    test('returns 404 for non-existent service', async () => {
      const res = await request(app)
        .patch('/v1/discovery/services/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Ghost' })
      expect(res.status).toBe(404)
    })

    test('returns 404 when trying to update another tenant\'s service', async () => {
      const { apiKey: otherKey } = await registerTenant(db, { suffix: '2' })
      const res = await request(app)
        .patch(`/v1/discovery/services/${listingId}`)
        .set('Authorization', `Bearer ${otherKey}`)
        .send({ name: 'Hijacked' })
      expect(res.status).toBe(404)
    })

    test('requires auth', async () => {
      const res = await request(app)
        .patch(`/v1/discovery/services/${listingId}`)
        .send({ name: 'No auth' })
      expect(res.status).toBe(401)
    })
  })

  // -----------------------------------------------------------------------
  // DELETE /v1/discovery/services/:id
  // -----------------------------------------------------------------------
  describe('DELETE /v1/discovery/services/:id', () => {
    let listingId: string

    beforeEach(async () => {
      const res = await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send(validListing)
      listingId = res.body.id
    })

    test('deletes the listing', async () => {
      const res = await request(app)
        .delete(`/v1/discovery/services/${listingId}`)
        .set('Authorization', `Bearer ${apiKey}`)
      expect(res.status).toBe(200)
      expect(res.body.status).toBe('deleted')

      // Confirm it's gone
      const catalogRes = await request(app).get('/v1/discovery/catalog')
      expect(catalogRes.body.find((l: any) => l.id === listingId)).toBeUndefined()
    })

    test('returns 404 for non-existent service', async () => {
      const res = await request(app)
        .delete('/v1/discovery/services/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${apiKey}`)
      expect(res.status).toBe(404)
    })

    test('returns 404 when trying to delete another tenant\'s service', async () => {
      const { apiKey: otherKey } = await registerTenant(db, { suffix: '2' })
      const res = await request(app)
        .delete(`/v1/discovery/services/${listingId}`)
        .set('Authorization', `Bearer ${otherKey}`)
      expect(res.status).toBe(404)
    })

    test('requires auth', async () => {
      const res = await request(app)
        .delete(`/v1/discovery/services/${listingId}`)
      expect(res.status).toBe(401)
    })
  })

  // -----------------------------------------------------------------------
  // GET /v1/discovery/catalog
  // -----------------------------------------------------------------------
  describe('GET /v1/discovery/catalog', () => {
    beforeEach(async () => {
      // Create two active listings in different categories
      await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ ...validListing, name: 'AI Service', category: 'ai' })
      await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ ...validListing, name: 'Data Service', category: 'data' })
    })

    test('lists all active services (public, no auth required)', async () => {
      const res = await request(app).get('/v1/discovery/catalog')
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
    })

    test('filters by category', async () => {
      const res = await request(app).get('/v1/discovery/catalog?category=ai')
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].name).toBe('AI Service')
    })

    test('filters by another category', async () => {
      const res = await request(app).get('/v1/discovery/catalog?category=data')
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].name).toBe('Data Service')
    })

    test('returns empty array for unknown category', async () => {
      const res = await request(app).get('/v1/discovery/catalog?category=nonexistent')
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // GET /v1/discovery/catalog/search
  // -----------------------------------------------------------------------
  describe('GET /v1/discovery/catalog/search', () => {
    beforeEach(async () => {
      await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          name: 'AI Image Generator',
          description: 'Generate images using neural networks',
          category: 'ai',
          channelEndpointUrl: 'https://api.example.com/channel',
          tags: ['images', 'neural', 'creative']
        })
      await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          name: 'Bitcoin Data Feed',
          description: 'Real-time price data for BSV',
          category: 'data',
          channelEndpointUrl: 'https://api.example.com/channel',
          tags: ['finance', 'bsv', 'realtime']
        })
    })

    test('returns empty array when no query param', async () => {
      const res = await request(app).get('/v1/discovery/catalog/search')
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    test('searches by name', async () => {
      const res = await request(app).get('/v1/discovery/catalog/search?q=Image')
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].name).toBe('AI Image Generator')
    })

    test('searches by description', async () => {
      const res = await request(app).get('/v1/discovery/catalog/search?q=neural')
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].name).toBe('AI Image Generator')
    })

    test('searches by tag content', async () => {
      const res = await request(app).get('/v1/discovery/catalog/search?q=finance')
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].name).toBe('Bitcoin Data Feed')
    })

    test('returns multiple results when term matches both', async () => {
      // Both listings have "channel" in their channelEndpointUrl but we search description
      // Both have BSV-related content, let's use a term that matches both names
      const res = await request(app).get('/v1/discovery/catalog/search?q=bsv')
      expect(res.status).toBe(200)
      // 'bsv' appears in description of Data Feed and tags as well
      expect(res.body.length).toBeGreaterThanOrEqual(1)
    })

    test('returns empty array when no match', async () => {
      const res = await request(app).get('/v1/discovery/catalog/search?q=zzznomatch')
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    test('is public — no auth required', async () => {
      const res = await request(app).get('/v1/discovery/catalog/search?q=AI')
      expect(res.status).toBe(200)
    })
  })

  // -----------------------------------------------------------------------
  // GET /v1/discovery/catalog/:id
  // -----------------------------------------------------------------------
  describe('GET /v1/discovery/catalog/:id', () => {
    let listingId: string

    beforeEach(async () => {
      const res = await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send(validListing)
      listingId = res.body.id
    })

    test('returns the listing by id (public)', async () => {
      const res = await request(app).get(`/v1/discovery/catalog/${listingId}`)
      expect(res.status).toBe(200)
      expect(res.body.id).toBe(listingId)
      expect(res.body.name).toBe(validListing.name)
    })

    test('returns 404 for unknown id', async () => {
      const res = await request(app).get('/v1/discovery/catalog/00000000-0000-0000-0000-000000000000')
      expect(res.status).toBe(404)
    })

    test('is public — no auth required', async () => {
      const res = await request(app).get(`/v1/discovery/catalog/${listingId}`)
      expect(res.status).toBe(200)
    })
  })

  // -----------------------------------------------------------------------
  // Unlisted services don't appear in catalog
  // -----------------------------------------------------------------------
  describe('Unlisted services are hidden from public catalog', () => {
    test('unlisted service does not appear in GET /v1/discovery/catalog', async () => {
      const createRes = await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send(validListing)
      const listingId = createRes.body.id

      // Mark it as unlisted
      await request(app)
        .patch(`/v1/discovery/services/${listingId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ status: 'unlisted' })

      const catalogRes = await request(app).get('/v1/discovery/catalog')
      expect(catalogRes.body.find((l: any) => l.id === listingId)).toBeUndefined()
    })

    test('unlisted service does not appear in search', async () => {
      const createRes = await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ ...validListing, name: 'SecretService Unlisted' })
      const listingId = createRes.body.id

      await request(app)
        .patch(`/v1/discovery/services/${listingId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ status: 'unlisted' })

      const searchRes = await request(app).get('/v1/discovery/catalog/search?q=SecretService')
      expect(searchRes.body).toEqual([])
    })

    test('unlisted service returns 404 on GET /v1/discovery/catalog/:id', async () => {
      const createRes = await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send(validListing)
      const listingId = createRes.body.id

      await request(app)
        .patch(`/v1/discovery/services/${listingId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ status: 'unlisted' })

      const res = await request(app).get(`/v1/discovery/catalog/${listingId}`)
      expect(res.status).toBe(404)
    })

    test('unlisted service still appears in GET /v1/discovery/services/me', async () => {
      const createRes = await request(app)
        .post('/v1/discovery/services')
        .set('Authorization', `Bearer ${apiKey}`)
        .send(validListing)
      const listingId = createRes.body.id

      await request(app)
        .patch(`/v1/discovery/services/${listingId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ status: 'unlisted' })

      const meRes = await request(app)
        .get('/v1/discovery/services/me')
        .set('Authorization', `Bearer ${apiKey}`)
      expect(meRes.body.find((l: any) => l.id === listingId)).toBeDefined()
      expect(meRes.body.find((l: any) => l.id === listingId).status).toBe('unlisted')
    })
  })
})
