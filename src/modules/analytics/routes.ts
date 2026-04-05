import { Router } from 'express'
import type { Knex } from 'knex'
import { createApiKeyAuth } from '../auth/api-key-auth.js'
import { requireScopes } from '../auth/scopes.js'
import { createIdentityAuth } from '../auth/identity-auth.js'
import { createAnalyticsService } from './service.js'

export function createAnalyticsRoutes (db: Knex): Router {
  const router = Router()
  const tenantAuth = createApiKeyAuth(db)
  const userAuth = createIdentityAuth(db)
  const scopes = { write: requireScopes('analytics:write'), read: requireScopes('analytics:read') }
  const service = createAnalyticsService(db)

  // --- Event ingestion (from tenant middleware) ---
  router.post('/events', tenantAuth, scopes.write, async (req, res, next) => {
    try {
      const result = await service.ingestEvents(req.tenant!.id, req.body.events ?? [])
      res.json(result)
    } catch (err) { next(err) }
  })

  router.post('/events/batch', tenantAuth, scopes.write, async (req, res, next) => {
    try {
      const result = await service.ingestEvents(req.tenant!.id, req.body.events ?? [])
      res.json(result)
    } catch (err) { next(err) }
  })

  // --- Tenant queries ---
  router.get('/revenue', tenantAuth, scopes.read, async (req, res, next) => {
    try {
      const data = await service.getRevenue(
        req.tenant!.id,
        req.query.periodStart as string | undefined,
        req.query.periodEnd as string | undefined
      )
      res.json(data)
    } catch (err) { next(err) }
  })

  router.get('/usage', tenantAuth, scopes.read, async (req, res, next) => {
    try {
      const data = await service.getUsage(
        req.tenant!.id,
        req.query.periodStart as string | undefined,
        req.query.periodEnd as string | undefined
      )
      res.json(data)
    } catch (err) { next(err) }
  })

  router.get('/users/:identityKey', tenantAuth, scopes.read, async (req, res, next) => {
    try {
      const data = await service.getUserSpending(req.tenant!.id, req.params.identityKey as string)
      res.json(data)
    } catch (err) { next(err) }
  })

  // --- User queries ---
  router.get('/me/spending', userAuth, async (req, res, next) => {
    try {
      const data = await service.getSpendingAcrossTenants(req.user!.bsvIdentityKey)
      res.json(data)
    } catch (err) { next(err) }
  })

  return router
}
