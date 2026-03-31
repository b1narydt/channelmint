import express from 'express'
import type { Knex } from 'knex'
import { NotFoundError } from './shared/errors.js'
import { errorHandler } from './shared/error-middleware.js'
import { createTenantRoutes } from './modules/tenants/routes.js'
import { createUserRoutes } from './modules/users/routes.js'
import { createBillingRoutes } from './modules/billing/routes.js'
import { createOnrampRoutes } from './modules/onramp/routes.js'

export function createApp (db: Knex): express.Express {
  const app = express()
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.use('/v1/tenants', createTenantRoutes(db))
  app.use('/v1/users', createUserRoutes(db))
  app.use('/v1/billing', createBillingRoutes(db))
  app.use('/v1/onramp', createOnrampRoutes(db))

  app.use((_req: express.Request, _res: express.Response, next: express.NextFunction) => {
    next(new NotFoundError('Route not found'))
  })

  app.use(errorHandler)

  return app
}
