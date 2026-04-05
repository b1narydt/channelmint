import { Router } from 'express'
import type { Knex } from 'knex'
import { createIdentityAuth } from '../auth/identity-auth.js'
import { createUserService } from './service.js'
import { AuthError } from '../../shared/errors.js'

const IDENTITY_KEY_REGEX = /^0[23][0-9a-f]{64}$/i

export function createUserRoutes (db: Knex): Router {
  const router = Router()
  const identityAuth = createIdentityAuth(db)
  const service = createUserService(db)

  router.post('/', async (req, res, next) => {
    try {
      const identityKey = req.headers['x-bsv-identity-key'] as string | undefined
      if (!identityKey || !IDENTITY_KEY_REGEX.test(identityKey)) {
        throw new AuthError('Missing or invalid x-bsv-identity-key header')
      }
      const { user, created } = await service.findOrCreate(identityKey)
      res.status(created ? 201 : 200).json(user)
    } catch (err) { next(err) }
  })

  router.get('/me', identityAuth, async (req, res, next) => {
    try {
      const user = await service.getByIdentityKey(req.user!.bsvIdentityKey)
      res.json(user)
    } catch (err) { next(err) }
  })

  return router
}
