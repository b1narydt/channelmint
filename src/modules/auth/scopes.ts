import type { Request, Response, NextFunction } from 'express'
import { AuthError } from '../../shared/errors.js'

export function requireScopes (...requiredScopes: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.tenant) {
      throw new AuthError('Authentication required')
    }

    const hasAll = requiredScopes.every(s => req.tenant!.scopes.includes(s))
    if (!hasAll) {
      throw new AuthError(`Missing required scopes: ${requiredScopes.join(', ')}`)
    }

    next()
  }
}
