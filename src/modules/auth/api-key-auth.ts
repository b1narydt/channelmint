import crypto from 'crypto'
import type { Request, Response, NextFunction } from 'express'
import type { Knex } from 'knex'
import { AuthError } from '../../shared/errors.js'

declare global {
  namespace Express {
    interface Request {
      tenant?: {
        id: string
        scopes: string[]
      }
    }
  }
}

export function createApiKeyAuth (db: Knex) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      throw new AuthError('Missing or malformed Authorization header')
    }

    const key = header.slice(7)
    const prefix = key.slice(0, 8)
    const keyHash = crypto.createHash('sha256').update(key).digest('hex')

    const row = await db('api_keys')
      .join('tenants', 'api_keys.tenant_id', 'tenants.id')
      .where('api_keys.prefix', prefix)
      .where('api_keys.key_hash', keyHash)
      .where('tenants.status', 'active')
      .select('api_keys.tenant_id', 'api_keys.scopes', 'api_keys.expires_at')
      .first()

    if (!row) {
      throw new AuthError('Invalid API key')
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      throw new AuthError('API key has expired')
    }

    req.tenant = {
      id: row.tenant_id,
      scopes: JSON.parse(row.scopes)
    }

    next()
  }
}
