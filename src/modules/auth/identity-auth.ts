import type { Request, Response, NextFunction } from 'express'
import type { Knex } from 'knex'
import { AuthError } from '../../shared/errors.js'

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        bsvIdentityKey: string
      }
    }
  }
}

export function createIdentityAuth (db: Knex) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const identityKey = req.headers['x-bsv-identity-key'] as string | undefined
    if (!identityKey || !/^0[23][0-9a-f]{64}$/i.test(identityKey)) {
      throw new AuthError('Missing or invalid x-bsv-identity-key header')
    }

    const user = await db('users')
      .where('bsv_identity_key', identityKey)
      .where('status', 'active')
      .first()

    if (!user) {
      throw new AuthError('User not found')
    }

    req.user = {
      id: user.id,
      bsvIdentityKey: user.bsv_identity_key
    }

    next()
  }
}
