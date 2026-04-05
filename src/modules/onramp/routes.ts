import { Router } from 'express'
import type { Knex } from 'knex'
import { createIdentityAuth } from '../auth/identity-auth.js'
import { createOnrampService } from './service.js'

export function createOnrampRoutes (db: Knex): Router {
  const router = Router()
  const identityAuth = createIdentityAuth(db)
  const service = createOnrampService(db)

  // POST /session — create purchase + get Ramp widget config
  router.post('/session', identityAuth, async (req, res, next) => {
    try {
      const result = await service.createSession(req.user!.id, req.body)
      res.status(201).json(result)
    } catch (err) { next(err) }
  })

  // GET /purchases — list user's purchases
  router.get('/purchases', identityAuth, async (req, res, next) => {
    try {
      const purchases = await service.listPurchases(req.user!.id)
      res.json(purchases)
    } catch (err) { next(err) }
  })

  // GET /purchases/:id — single purchase
  router.get('/purchases/:id', identityAuth, async (req, res, next) => {
    try {
      const purchase = await service.getPurchase(req.user!.id, req.params.id as string)
      res.json(purchase)
    } catch (err) { next(err) }
  })

  // POST /webhooks/ramp — Ramp webhook receiver (no auth — verified by signature in production)
  router.post('/webhooks/ramp', async (req, res, next) => {
    try {
      await service.handleWebhook(req.body)
      res.json({ status: 'ok' })
    } catch (err) { next(err) }
  })

  return router
}
