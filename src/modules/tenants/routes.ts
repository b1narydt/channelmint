import { Router } from 'express'
import type { Knex } from 'knex'
import { createApiKeyAuth } from '../auth/api-key-auth.js'
import { createTenantService } from './service.js'

export function createTenantRoutes (db: Knex): Router {
  const router = Router()
  const auth = createApiKeyAuth(db)
  const service = createTenantService(db)

  router.post('/', async (req, res, next) => {
    try {
      const result = await service.register(req.body)
      res.status(201).json(result)
    } catch (err) { next(err) }
  })

  router.get('/me', auth, async (req, res, next) => {
    try {
      const tenant = await service.getById(req.tenant!.id)
      res.json(tenant)
    } catch (err) { next(err) }
  })

  router.patch('/me', auth, async (req, res, next) => {
    try {
      const tenant = await service.update(req.tenant!.id, req.body)
      res.json(tenant)
    } catch (err) { next(err) }
  })

  router.post('/me/api-keys', auth, async (req, res, next) => {
    try {
      const result = await service.createApiKey(req.tenant!.id, req.body)
      res.status(201).json(result)
    } catch (err) { next(err) }
  })

  router.delete('/me/api-keys/:id', auth, async (req, res, next) => {
    try {
      await service.deleteApiKey(req.tenant!.id, req.params.id as string)
      res.json({ status: 'deleted' })
    } catch (err) { next(err) }
  })

  return router
}
