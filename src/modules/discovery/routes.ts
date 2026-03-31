import { Router } from 'express'
import type { Knex } from 'knex'
import { createApiKeyAuth } from '../auth/api-key-auth.js'
import { requireScopes } from '../auth/scopes.js'
import { createDiscoveryService } from './service.js'

export function createDiscoveryRoutes (db: Knex): Router {
  const router = Router()
  const auth = createApiKeyAuth(db)
  const scopes = { write: requireScopes('discovery:write') }
  const service = createDiscoveryService(db)

  // --- Tenant management (auth required) ---
  router.post('/services', auth, scopes.write, async (req, res, next) => {
    try {
      const listing = await service.createService(req.tenant!.id, req.body)
      res.status(201).json(listing)
    } catch (err) { next(err) }
  })

  router.get('/services/me', auth, async (req, res, next) => {
    try {
      const listings = await service.listOwnServices(req.tenant!.id)
      res.json(listings)
    } catch (err) { next(err) }
  })

  router.patch('/services/:id', auth, scopes.write, async (req, res, next) => {
    try {
      const listing = await service.updateService(req.tenant!.id, req.params.id as string, req.body)
      res.json(listing)
    } catch (err) { next(err) }
  })

  router.delete('/services/:id', auth, scopes.write, async (req, res, next) => {
    try {
      await service.deleteService(req.tenant!.id, req.params.id as string)
      res.json({ status: 'deleted' })
    } catch (err) { next(err) }
  })

  // --- Public catalog (no auth) ---
  router.get('/catalog', async (req, res, next) => {
    try {
      const category = req.query.category as string | undefined
      const listings = await service.browseCatalog(category)
      res.json(listings)
    } catch (err) { next(err) }
  })

  router.get('/catalog/search', async (req, res, next) => {
    try {
      const q = req.query.q as string
      if (!q) {
        res.json([])
        return
      }
      const listings = await service.searchCatalog(q)
      res.json(listings)
    } catch (err) { next(err) }
  })

  router.get('/catalog/:id', async (req, res, next) => {
    try {
      const listing = await service.getService(req.params.id as string)
      res.json(listing)
    } catch (err) { next(err) }
  })

  return router
}
