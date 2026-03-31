import { AppError, NotFoundError, ValidationError, AuthError, ConflictError } from '../errors.js'

describe('AppError', () => {
  test('sets statusCode, code, and message', () => {
    const err = new AppError(418, 'TEAPOT', 'I am a teapot')
    expect(err.statusCode).toBe(418)
    expect(err.code).toBe('TEAPOT')
    expect(err.message).toBe('I am a teapot')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('NotFoundError', () => {
  test('defaults to 404 with NOT_FOUND code', () => {
    const err = new NotFoundError('Tenant not found')
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('NOT_FOUND')
    expect(err.message).toBe('Tenant not found')
  })
})

describe('ValidationError', () => {
  test('defaults to 400 with VALIDATION_ERROR code', () => {
    const err = new ValidationError('Invalid email')
    expect(err.statusCode).toBe(400)
    expect(err.code).toBe('VALIDATION_ERROR')
  })
})

describe('AuthError', () => {
  test('defaults to 401 with AUTH_ERROR code', () => {
    const err = new AuthError('Invalid API key')
    expect(err.statusCode).toBe(401)
    expect(err.code).toBe('AUTH_ERROR')
  })
})

describe('ConflictError', () => {
  test('defaults to 409 with CONFLICT code', () => {
    const err = new ConflictError('Already exists')
    expect(err.statusCode).toBe(409)
    expect(err.code).toBe('CONFLICT')
  })
})
