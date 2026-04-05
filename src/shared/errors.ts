export class AppError extends Error {
  constructor (
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class NotFoundError extends AppError {
  constructor (message: string) {
    super(404, 'NOT_FOUND', message)
  }
}

export class ValidationError extends AppError {
  constructor (message: string) {
    super(400, 'VALIDATION_ERROR', message)
  }
}

export class AuthError extends AppError {
  constructor (message: string) {
    super(401, 'AUTH_ERROR', message)
  }
}

export class ConflictError extends AppError {
  constructor (message: string) {
    super(409, 'CONFLICT', message)
  }
}
