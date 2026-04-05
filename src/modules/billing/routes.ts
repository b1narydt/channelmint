import { Router } from 'express'
import type { Knex } from 'knex'
import { createApiKeyAuth } from '../auth/api-key-auth.js'
import { requireScopes } from '../auth/scopes.js'
import { createBillingService } from './service.js'
import { NotFoundError } from '../../shared/errors.js'

export function createBillingRoutes (db: Knex): Router {
  const router = Router()
  const auth = createApiKeyAuth(db)
  const scopes = { read: requireScopes('billing:read'), write: requireScopes('billing:write') }
  const service = createBillingService(db)

  // --- Products ---
  router.post('/products', auth, scopes.write, async (req, res, next) => {
    try {
      const product = await service.createProduct(req.tenant!.id, req.body)
      res.status(201).json(product)
    } catch (err) { next(err) }
  })

  router.get('/products', auth, scopes.read, async (req, res, next) => {
    try {
      const products = await service.listProducts(req.tenant!.id)
      res.json(products)
    } catch (err) { next(err) }
  })

  router.patch('/products/:id', auth, scopes.write, async (req, res, next) => {
    try {
      const product = await service.updateProduct(req.tenant!.id, req.params.id as string, req.body)
      res.json(product)
    } catch (err) { next(err) }
  })

  // --- Rate Cards ---
  router.post('/rate-cards', auth, scopes.write, async (req, res, next) => {
    try {
      const rc = await service.createRateCard(req.tenant!.id, req.body)
      res.status(201).json(rc)
    } catch (err) { next(err) }
  })

  router.get('/rate-cards', auth, scopes.read, async (req, res, next) => {
    try {
      const rcs = await service.listRateCards(req.tenant!.id)
      res.json(rcs)
    } catch (err) { next(err) }
  })

  router.post('/rate-cards/:id/rates', auth, scopes.write, async (req, res, next) => {
    try {
      const rate = await service.addRate(req.tenant!.id, req.params.id as string, req.body)
      res.status(201).json(rate)
    } catch (err) { next(err) }
  })

  router.get('/rate-cards/:id/rates', auth, scopes.read, async (req, res, next) => {
    try {
      const rates = await service.listRates(req.tenant!.id, req.params.id as string)
      res.json(rates)
    } catch (err) { next(err) }
  })

  // --- Content Pricing ---
  router.post('/content-pricing', auth, scopes.write, async (req, res, next) => {
    try {
      const cp = await service.createContentPricing(req.tenant!.id, req.body)
      res.status(201).json(cp)
    } catch (err) { next(err) }
  })

  router.get('/content-pricing', auth, scopes.read, async (req, res, next) => {
    try {
      const rules = await service.listContentPricing(req.tenant!.id)
      res.json(rules)
    } catch (err) { next(err) }
  })

  router.patch('/content-pricing/:id', auth, scopes.write, async (req, res, next) => {
    try {
      const cp = await service.updateContentPricing(req.tenant!.id, req.params.id as string, req.body)
      res.json(cp)
    } catch (err) { next(err) }
  })

  // --- Config Resolution (called by RemoteChannelProvider) ---
  router.get('/config/:contentId', auth, scopes.read, async (req, res, next) => {
    try {
      const contentId = decodeURIComponent(req.params.contentId as string)
      const config = await service.resolveConfig(req.tenant!.id, contentId)
      if (!config) {
        throw new NotFoundError(`No pricing configured for content: ${contentId}`)
      }
      res.json(config)
    } catch (err) { next(err) }
  })

  return router
}
