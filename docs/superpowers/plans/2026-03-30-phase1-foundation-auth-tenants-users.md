# Phase 1: Foundation + Auth + Tenants + Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the ChannelMint platform with project foundation, database, shared error handling, API key authentication, tenant registration, and user identity — the minimum needed before billing, analytics, onramp, or discovery modules.

**Architecture:** Modular monolith Express app with TypeScript. Each module owns its routes, data models, and internal interface. PostgreSQL via Knex for persistence. API keys for tenant auth, BRC-103 wallet identity for user auth.

**Tech Stack:** Node.js, TypeScript, Express 5, Knex, PostgreSQL (SQLite for dev/test), Jest, @bsv/sdk (for identity key validation)

---

## File Structure

```
channelmint/
├── package.json
├── tsconfig.json
├── jest.config.js
├── .env.example
├── src/
│   ├── app.ts                          # Express app factory
│   ├── index.ts                        # Entry point (starts server)
│   ├── config/
│   │   └── index.ts                    # Env-based config
│   ├── db/
│   │   ├── connection.ts               # Knex connection factory
│   │   └── migrations/
│   │       ├── 001_create_tenants.ts
│   │       ├── 002_create_api_keys.ts
│   │       └── 003_create_users.ts
│   ├── shared/
│   │   ├── errors.ts                   # AppError, NotFoundError, etc.
│   │   └── error-middleware.ts         # Express error handler
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── routes.ts              # No routes — provides middleware only
│   │   │   ├── api-key-auth.ts        # API key auth middleware
│   │   │   ├── identity-auth.ts       # BRC-103 identity auth middleware (stub)
│   │   │   └── scopes.ts             # Scope checking middleware
│   │   ├── tenants/
│   │   │   ├── routes.ts             # POST /, GET /me, PATCH /me, POST /me/api-keys, DELETE /me/api-keys/:id
│   │   │   ├── service.ts            # Business logic
│   │   │   └── types.ts              # Tenant, CreateTenantRequest, etc.
│   │   └── users/
│   │       ├── routes.ts             # POST /, GET /me
│   │       ├── service.ts            # Business logic
│   │       └── types.ts              # User, CreateUserRequest, etc.
│   └── test/
│       └── helpers.ts                 # Test utilities (createTestApp, etc.)
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.js`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "channelmint",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "jest",
    "migrate": "tsx src/db/migrate.ts",
    "migrate:rollback": "tsx src/db/rollback.ts"
  },
  "dependencies": {
    "@bsv/sdk": "^2.0.0",
    "express": "^5.1.0",
    "knex": "^3.1.0",
    "better-sqlite3": "^12.0.0",
    "uuid": "^11.0.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/uuid": "^10.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.0",
    "tsx": "^4.0.0",
    "typescript": "^5.7.0",
    "@types/jest": "^29.5.0",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["dist", "**/*.test.ts", "src/test"]
}
```

- [ ] **Step 3: Create jest.config.js**

```javascript
/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['dist/'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2022',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true
      }
    }]
  }
}
```

- [ ] **Step 4: Create .env.example**

```
PORT=3000
DATABASE_URL=sqlite://./channelmint.db
NODE_ENV=development
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
*.db
.env
```

- [ ] **Step 6: Install dependencies**

Run: `cd /Users/donot/metanet-projects/channelmint && npm install`

- [ ] **Step 7: Verify build**

Run: `npx tsc --noEmit` (will succeed with no source files — just validates tsconfig)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold project with package.json, tsconfig, jest config"
```

---

### Task 2: Config + Database Connection + Shared Errors

**Files:**
- Create: `src/config/index.ts`
- Create: `src/db/connection.ts`
- Create: `src/shared/errors.ts`
- Create: `src/shared/error-middleware.ts`

- [ ] **Step 1: Write tests for shared errors**

Create `src/shared/__tests__/errors.test.ts`:

```typescript
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
```

- [ ] **Step 2: Implement shared errors**

Create `src/shared/errors.ts`:

```typescript
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
```

- [ ] **Step 3: Implement error middleware**

Create `src/shared/error-middleware.ts`:

```typescript
import type { Request, Response, NextFunction } from 'express'
import { AppError } from './errors.js'

export function errorHandler (err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      code: err.code,
      message: err.message
    })
    return
  }

  console.error('Unhandled error:', err)
  res.status(500).json({
    status: 'error',
    code: 'INTERNAL_ERROR',
    message: 'Internal server error'
  })
}
```

- [ ] **Step 4: Implement config**

Create `src/config/index.ts`:

```typescript
export interface AppConfig {
  port: number
  databaseUrl: string
  nodeEnv: string
}

export function loadConfig (): AppConfig {
  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    databaseUrl: process.env.DATABASE_URL ?? 'sqlite://./channelmint.db',
    nodeEnv: process.env.NODE_ENV ?? 'development'
  }
}
```

- [ ] **Step 5: Implement database connection**

Create `src/db/connection.ts`:

```typescript
import knex, { type Knex } from 'knex'

export function createDatabase (databaseUrl: string): Knex {
  if (databaseUrl.startsWith('sqlite://')) {
    const filename = databaseUrl.replace('sqlite://', '')
    return knex({
      client: 'better-sqlite3',
      connection: { filename },
      useNullAsDefault: true
    })
  }

  return knex({
    client: 'pg',
    connection: databaseUrl,
    pool: { min: 2, max: 10 }
  })
}

export function createTestDatabase (): Knex {
  return knex({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true
  })
}
```

- [ ] **Step 6: Run tests**

Run: `npx jest src/shared/__tests__/errors.test.ts --no-cache`
Expected: All 5 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/config src/db src/shared
git commit -m "feat: add config, database connection, and shared error classes"
```

---

### Task 3: Database Migrations

**Files:**
- Create: `src/db/migrations/001_create_tenants.ts`
- Create: `src/db/migrations/002_create_api_keys.ts`
- Create: `src/db/migrations/003_create_users.ts`
- Create: `src/db/migrate.ts`
- Create: `src/db/rollback.ts`

- [ ] **Step 1: Write migration test**

Create `src/db/__tests__/migrations.test.ts`:

```typescript
import { createTestDatabase } from '../connection.js'
import type { Knex } from 'knex'

// Import migrations directly
import { up as upTenants, down as downTenants } from '../migrations/001_create_tenants.js'
import { up as upApiKeys, down as downApiKeys } from '../migrations/002_create_api_keys.js'
import { up as upUsers, down as downUsers } from '../migrations/003_create_users.js'

describe('migrations', () => {
  let db: Knex

  beforeEach(() => {
    db = createTestDatabase()
  })

  afterEach(async () => {
    await db.destroy()
  })

  test('001: creates tenants table with correct columns', async () => {
    await upTenants(db)
    const columns = await db('tenants').columnInfo()
    expect(columns).toHaveProperty('id')
    expect(columns).toHaveProperty('name')
    expect(columns).toHaveProperty('email')
    expect(columns).toHaveProperty('bsv_identity_key')
    expect(columns).toHaveProperty('channel_endpoint_url')
    expect(columns).toHaveProperty('webhook_url')
    expect(columns).toHaveProperty('webhook_secret')
    expect(columns).toHaveProperty('status')
    expect(columns).toHaveProperty('created_at')
    expect(columns).toHaveProperty('updated_at')
  })

  test('001: down drops tenants table', async () => {
    await upTenants(db)
    await downTenants(db)
    const exists = await db.schema.hasTable('tenants')
    expect(exists).toBe(false)
  })

  test('002: creates api_keys table with correct columns', async () => {
    await upTenants(db)
    await upApiKeys(db)
    const columns = await db('api_keys').columnInfo()
    expect(columns).toHaveProperty('id')
    expect(columns).toHaveProperty('tenant_id')
    expect(columns).toHaveProperty('key_hash')
    expect(columns).toHaveProperty('prefix')
    expect(columns).toHaveProperty('scopes')
    expect(columns).toHaveProperty('label')
    expect(columns).toHaveProperty('expires_at')
    expect(columns).toHaveProperty('created_at')
  })

  test('003: creates users table with correct columns', async () => {
    await upUsers(db)
    const columns = await db('users').columnInfo()
    expect(columns).toHaveProperty('id')
    expect(columns).toHaveProperty('bsv_identity_key')
    expect(columns).toHaveProperty('email')
    expect(columns).toHaveProperty('ramp_customer_id')
    expect(columns).toHaveProperty('status')
    expect(columns).toHaveProperty('created_at')
    expect(columns).toHaveProperty('updated_at')
  })

  test('all migrations run and rollback in sequence', async () => {
    await upTenants(db)
    await upApiKeys(db)
    await upUsers(db)

    expect(await db.schema.hasTable('tenants')).toBe(true)
    expect(await db.schema.hasTable('api_keys')).toBe(true)
    expect(await db.schema.hasTable('users')).toBe(true)

    await downUsers(db)
    await downApiKeys(db)
    await downTenants(db)

    expect(await db.schema.hasTable('tenants')).toBe(false)
    expect(await db.schema.hasTable('api_keys')).toBe(false)
    expect(await db.schema.hasTable('users')).toBe(false)
  })
})
```

- [ ] **Step 2: Implement migrations**

Create `src/db/migrations/001_create_tenants.ts`:

```typescript
import type { Knex } from 'knex'

export async function up (db: Knex): Promise<void> {
  await db.schema.createTable('tenants', (t) => {
    t.uuid('id').primary()
    t.string('name').notNullable()
    t.string('email').notNullable().unique()
    t.string('bsv_identity_key', 66).notNullable().unique()
    t.string('channel_endpoint_url').nullable()
    t.string('webhook_url').nullable()
    t.string('webhook_secret').nullable()
    t.string('status').notNullable().defaultTo('active')
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now())
    t.timestamp('updated_at').notNullable().defaultTo(db.fn.now())
  })
}

export async function down (db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('tenants')
}
```

Create `src/db/migrations/002_create_api_keys.ts`:

```typescript
import type { Knex } from 'knex'

export async function up (db: Knex): Promise<void> {
  await db.schema.createTable('api_keys', (t) => {
    t.uuid('id').primary()
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE')
    t.string('key_hash', 64).notNullable().unique()
    t.string('prefix', 8).notNullable()
    t.text('scopes').notNullable()
    t.string('label').notNullable()
    t.timestamp('expires_at').nullable()
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now())

    t.index('prefix')
  })
}

export async function down (db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('api_keys')
}
```

Create `src/db/migrations/003_create_users.ts`:

```typescript
import type { Knex } from 'knex'

export async function up (db: Knex): Promise<void> {
  await db.schema.createTable('users', (t) => {
    t.uuid('id').primary()
    t.string('bsv_identity_key', 66).notNullable().unique()
    t.string('email').nullable()
    t.string('ramp_customer_id').nullable()
    t.string('status').notNullable().defaultTo('active')
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now())
    t.timestamp('updated_at').notNullable().defaultTo(db.fn.now())
  })
}

export async function down (db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('users')
}
```

- [ ] **Step 3: Create migrate/rollback scripts**

Create `src/db/migrate.ts`:

```typescript
import { createDatabase } from './connection.js'
import { loadConfig } from '../config/index.js'
import { up as upTenants } from './migrations/001_create_tenants.js'
import { up as upApiKeys } from './migrations/002_create_api_keys.js'
import { up as upUsers } from './migrations/003_create_users.js'

const config = loadConfig()
const db = createDatabase(config.databaseUrl)

async function migrate (): Promise<void> {
  console.log('Running migrations...')
  await upTenants(db)
  await upApiKeys(db)
  await upUsers(db)
  console.log('Migrations complete.')
  await db.destroy()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
```

Create `src/db/rollback.ts`:

```typescript
import { createDatabase } from './connection.js'
import { loadConfig } from '../config/index.js'
import { down as downUsers } from './migrations/003_create_users.js'
import { down as downApiKeys } from './migrations/002_create_api_keys.js'
import { down as downTenants } from './migrations/001_create_tenants.js'

const config = loadConfig()
const db = createDatabase(config.databaseUrl)

async function rollback (): Promise<void> {
  console.log('Rolling back migrations...')
  await downUsers(db)
  await downApiKeys(db)
  await downTenants(db)
  console.log('Rollback complete.')
  await db.destroy()
}

rollback().catch((err) => {
  console.error('Rollback failed:', err)
  process.exit(1)
})
```

- [ ] **Step 4: Run migration tests**

Run: `npx jest src/db/__tests__/migrations.test.ts --no-cache`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/db
git commit -m "feat: add database migrations for tenants, api_keys, and users"
```

---

### Task 4: Test Helpers + Express App Factory

**Files:**
- Create: `src/test/helpers.ts`
- Create: `src/app.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Write app test**

Create `src/__tests__/app.test.ts`:

```typescript
import request from 'supertest'
import { createApp } from '../app.js'
import { createTestDatabase } from '../db/connection.js'
import { up as upTenants } from '../db/migrations/001_create_tenants.js'
import { up as upApiKeys } from '../db/migrations/002_create_api_keys.js'
import { up as upUsers } from '../db/migrations/003_create_users.js'
import type { Knex } from 'knex'

describe('App', () => {
  let db: Knex

  beforeEach(async () => {
    db = createTestDatabase()
    await upTenants(db)
    await upApiKeys(db)
    await upUsers(db)
  })

  afterEach(async () => {
    await db.destroy()
  })

  test('GET /health returns 200', async () => {
    const app = createApp(db)
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  test('GET /nonexistent returns 404', async () => {
    const app = createApp(db)
    const res = await request(app).get('/nonexistent')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  test('error handler returns JSON for thrown AppErrors', async () => {
    const app = createApp(db)
    const res = await request(app).get('/nonexistent')
    expect(res.body.status).toBe('error')
    expect(res.headers['content-type']).toMatch(/json/)
  })
})
```

- [ ] **Step 2: Implement app factory**

Create `src/app.ts`:

```typescript
import express from 'express'
import type { Knex } from 'knex'
import { NotFoundError } from './shared/errors.js'
import { errorHandler } from './shared/error-middleware.js'

export function createApp (db: Knex): express.Express {
  const app = express()
  app.use(express.json())

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  // TODO: Mount module routes here as they are implemented

  // 404 handler
  app.use((_req, _res, next) => {
    next(new NotFoundError('Route not found'))
  })

  // Error handler
  app.use(errorHandler)

  return app
}
```

- [ ] **Step 3: Create entry point**

Create `src/index.ts`:

```typescript
import { createApp } from './app.js'
import { createDatabase } from './db/connection.js'
import { loadConfig } from './config/index.js'

const config = loadConfig()
const db = createDatabase(config.databaseUrl)
const app = createApp(db)

app.listen(config.port, () => {
  console.log(`ChannelMint API listening on port ${config.port}`)
})
```

- [ ] **Step 4: Create test helper**

Create `src/test/helpers.ts`:

```typescript
import { createTestDatabase } from '../db/connection.js'
import { createApp } from '../app.js'
import { up as upTenants } from '../db/migrations/001_create_tenants.js'
import { up as upApiKeys } from '../db/migrations/002_create_api_keys.js'
import { up as upUsers } from '../db/migrations/003_create_users.js'
import type { Knex } from 'knex'
import type express from 'express'

export interface TestContext {
  app: express.Express
  db: Knex
  cleanup: () => Promise<void>
}

export async function createTestContext (): Promise<TestContext> {
  const db = createTestDatabase()
  await upTenants(db)
  await upApiKeys(db)
  await upUsers(db)

  const app = createApp(db)

  return {
    app,
    db,
    cleanup: () => db.destroy()
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npx jest src/__tests__/app.test.ts --no-cache`
Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/app.ts src/index.ts src/test src/__tests__/app.test.ts
git commit -m "feat: add Express app factory, entry point, and test helpers"
```

---

### Task 5: Auth Module — API Key Authentication

**Files:**
- Create: `src/modules/auth/api-key-auth.ts`
- Create: `src/modules/auth/scopes.ts`
- Create: `src/modules/auth/identity-auth.ts`
- Create: `src/modules/auth/__tests__/api-key-auth.test.ts`

- [ ] **Step 1: Write API key auth tests**

Create `src/modules/auth/__tests__/api-key-auth.test.ts`:

```typescript
import request from 'supertest'
import express from 'express'
import crypto from 'crypto'
import { v4 as uuid } from 'uuid'
import { createTestDatabase } from '../../../db/connection.js'
import { up as upTenants } from '../../../db/migrations/001_create_tenants.js'
import { up as upApiKeys } from '../../../db/migrations/002_create_api_keys.js'
import { createApiKeyAuth } from '../api-key-auth.js'
import type { Knex } from 'knex'

describe('API Key Authentication', () => {
  let db: Knex
  let app: express.Express
  let validKey: string
  let tenantId: string

  beforeEach(async () => {
    db = createTestDatabase()
    await upTenants(db)
    await upApiKeys(db)

    tenantId = uuid()
    await db('tenants').insert({
      id: tenantId,
      name: 'Test Tenant',
      email: 'test@example.com',
      bsv_identity_key: '02' + 'ab'.repeat(32),
      status: 'active'
    })

    validKey = 'cm_test_' + crypto.randomBytes(24).toString('hex')
    const keyHash = crypto.createHash('sha256').update(validKey).digest('hex')
    await db('api_keys').insert({
      id: uuid(),
      tenant_id: tenantId,
      key_hash: keyHash,
      prefix: validKey.slice(0, 8),
      scopes: JSON.stringify(['billing:read', 'billing:write']),
      label: 'Test Key'
    })

    app = express()
    app.use(express.json())
    const auth = createApiKeyAuth(db)
    app.get('/protected', auth, (req: any, res) => {
      res.json({ tenantId: req.tenant.id, scopes: req.tenant.scopes })
    })
  })

  afterEach(async () => {
    await db.destroy()
  })

  test('authenticates with valid API key', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${validKey}`)
    expect(res.status).toBe(200)
    expect(res.body.tenantId).toBe(tenantId)
    expect(res.body.scopes).toContain('billing:read')
  })

  test('rejects missing Authorization header', async () => {
    const res = await request(app).get('/protected')
    expect(res.status).toBe(401)
  })

  test('rejects invalid API key', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer cm_test_invalid')
    expect(res.status).toBe(401)
  })

  test('rejects malformed Authorization header', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Basic abc123')
    expect(res.status).toBe(401)
  })

  test('rejects expired API key', async () => {
    const expiredKey = 'cm_exp_' + crypto.randomBytes(24).toString('hex')
    const keyHash = crypto.createHash('sha256').update(expiredKey).digest('hex')
    await db('api_keys').insert({
      id: uuid(),
      tenant_id: tenantId,
      key_hash: keyHash,
      prefix: expiredKey.slice(0, 8),
      scopes: JSON.stringify(['billing:read']),
      label: 'Expired Key',
      expires_at: new Date(Date.now() - 86400000).toISOString()
    })

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${expiredKey}`)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Implement API key auth middleware**

Create `src/modules/auth/api-key-auth.ts`:

```typescript
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
```

- [ ] **Step 3: Implement scope checking middleware**

Create `src/modules/auth/scopes.ts`:

```typescript
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
```

- [ ] **Step 4: Create identity auth stub**

Create `src/modules/auth/identity-auth.ts`:

```typescript
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

/**
 * BRC-103 wallet identity authentication.
 * Stub for Phase 1 — validates identity key format only.
 * Full challenge/response implementation in a future phase.
 */
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
```

- [ ] **Step 5: Run auth tests**

Run: `npx jest src/modules/auth/__tests__/api-key-auth.test.ts --no-cache`
Expected: All 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/auth
git commit -m "feat: add API key auth, scope checking, and identity auth stub"
```

---

### Task 6: Tenants Module

**Files:**
- Create: `src/modules/tenants/types.ts`
- Create: `src/modules/tenants/service.ts`
- Create: `src/modules/tenants/routes.ts`
- Create: `src/modules/tenants/__tests__/tenants.test.ts`

- [ ] **Step 1: Write tenants tests**

Create `src/modules/tenants/__tests__/tenants.test.ts`:

```typescript
import request from 'supertest'
import crypto from 'crypto'
import { createTestContext, type TestContext } from '../../../test/helpers.js'

describe('Tenants API', () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await createTestContext()
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  describe('POST /v1/tenants', () => {
    test('registers a new tenant and returns API key', async () => {
      const res = await request(ctx.app)
        .post('/v1/tenants')
        .send({
          name: 'Acme Corp',
          email: 'admin@acme.com',
          bsvIdentityKey: '02' + 'ab'.repeat(32)
        })

      expect(res.status).toBe(201)
      expect(res.body.tenant.name).toBe('Acme Corp')
      expect(res.body.tenant.id).toBeDefined()
      expect(res.body.apiKey).toBeDefined()
      expect(res.body.apiKey).toMatch(/^cm_/)
    })

    test('rejects duplicate email', async () => {
      const body = {
        name: 'Acme Corp',
        email: 'admin@acme.com',
        bsvIdentityKey: '02' + 'ab'.repeat(32)
      }
      await request(ctx.app).post('/v1/tenants').send(body)

      const res = await request(ctx.app)
        .post('/v1/tenants')
        .send({ ...body, bsvIdentityKey: '03' + 'cd'.repeat(32) })

      expect(res.status).toBe(409)
    })

    test('rejects missing required fields', async () => {
      const res = await request(ctx.app)
        .post('/v1/tenants')
        .send({ name: 'Acme Corp' })

      expect(res.status).toBe(400)
    })

    test('rejects invalid identity key format', async () => {
      const res = await request(ctx.app)
        .post('/v1/tenants')
        .send({
          name: 'Acme Corp',
          email: 'admin@acme.com',
          bsvIdentityKey: 'not-a-valid-key'
        })

      expect(res.status).toBe(400)
    })
  })

  describe('GET /v1/tenants/me', () => {
    let apiKey: string

    beforeEach(async () => {
      const res = await request(ctx.app)
        .post('/v1/tenants')
        .send({
          name: 'Acme Corp',
          email: 'admin@acme.com',
          bsvIdentityKey: '02' + 'ab'.repeat(32)
        })
      apiKey = res.body.apiKey
    })

    test('returns tenant profile with valid API key', async () => {
      const res = await request(ctx.app)
        .get('/v1/tenants/me')
        .set('Authorization', `Bearer ${apiKey}`)

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Acme Corp')
      expect(res.body.email).toBe('admin@acme.com')
    })

    test('rejects without auth', async () => {
      const res = await request(ctx.app).get('/v1/tenants/me')
      expect(res.status).toBe(401)
    })
  })

  describe('PATCH /v1/tenants/me', () => {
    let apiKey: string

    beforeEach(async () => {
      const res = await request(ctx.app)
        .post('/v1/tenants')
        .send({
          name: 'Acme Corp',
          email: 'admin@acme.com',
          bsvIdentityKey: '02' + 'ab'.repeat(32)
        })
      apiKey = res.body.apiKey
    })

    test('updates tenant profile', async () => {
      const res = await request(ctx.app)
        .patch('/v1/tenants/me')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ channelEndpointUrl: 'https://api.acme.com/channels' })

      expect(res.status).toBe(200)
      expect(res.body.channelEndpointUrl).toBe('https://api.acme.com/channels')
    })
  })

  describe('POST /v1/tenants/me/api-keys', () => {
    let apiKey: string

    beforeEach(async () => {
      const res = await request(ctx.app)
        .post('/v1/tenants')
        .send({
          name: 'Acme Corp',
          email: 'admin@acme.com',
          bsvIdentityKey: '02' + 'ab'.repeat(32)
        })
      apiKey = res.body.apiKey
    })

    test('creates additional API key', async () => {
      const res = await request(ctx.app)
        .post('/v1/tenants/me/api-keys')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          label: 'Read-only key',
          scopes: ['billing:read']
        })

      expect(res.status).toBe(201)
      expect(res.body.apiKey).toMatch(/^cm_/)
      expect(res.body.label).toBe('Read-only key')
    })
  })

  describe('DELETE /v1/tenants/me/api-keys/:id', () => {
    let apiKey: string

    beforeEach(async () => {
      const res = await request(ctx.app)
        .post('/v1/tenants')
        .send({
          name: 'Acme Corp',
          email: 'admin@acme.com',
          bsvIdentityKey: '02' + 'ab'.repeat(32)
        })
      apiKey = res.body.apiKey
    })

    test('revokes an API key', async () => {
      // Create a second key to revoke
      const createRes = await request(ctx.app)
        .post('/v1/tenants/me/api-keys')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ label: 'Temp key', scopes: ['billing:read'] })

      const keyId = createRes.body.id

      const res = await request(ctx.app)
        .delete(`/v1/tenants/me/api-keys/${keyId}`)
        .set('Authorization', `Bearer ${apiKey}`)

      expect(res.status).toBe(200)

      // Verify the revoked key no longer works
      const verifyRes = await request(ctx.app)
        .get('/v1/tenants/me')
        .set('Authorization', `Bearer ${createRes.body.apiKey}`)

      expect(verifyRes.status).toBe(401)
    })
  })
})
```

- [ ] **Step 2: Implement tenant types**

Create `src/modules/tenants/types.ts`:

```typescript
export interface Tenant {
  id: string
  name: string
  email: string
  bsvIdentityKey: string
  channelEndpointUrl: string | null
  webhookUrl: string | null
  webhookSecret: string | null
  status: 'active' | 'suspended'
  createdAt: string
  updatedAt: string
}

export interface CreateTenantRequest {
  name: string
  email: string
  bsvIdentityKey: string
}

export interface UpdateTenantRequest {
  name?: string
  webhookUrl?: string
  channelEndpointUrl?: string
}

export interface CreateApiKeyRequest {
  label: string
  scopes: string[]
  expiresAt?: string
}
```

- [ ] **Step 3: Implement tenant service**

Create `src/modules/tenants/service.ts`:

```typescript
import crypto from 'crypto'
import { v4 as uuid } from 'uuid'
import type { Knex } from 'knex'
import { ConflictError, ValidationError } from '../../shared/errors.js'
import type { Tenant, CreateTenantRequest, UpdateTenantRequest, CreateApiKeyRequest } from './types.js'

const IDENTITY_KEY_REGEX = /^0[23][0-9a-f]{64}$/i
const DEFAULT_SCOPES = ['billing:read', 'billing:write', 'analytics:read', 'analytics:write', 'discovery:read', 'discovery:write']

function generateApiKey (): string {
  return 'cm_' + crypto.randomBytes(32).toString('hex')
}

export function createTenantService (db: Knex) {
  return {
    async register (input: CreateTenantRequest): Promise<{ tenant: Tenant; apiKey: string }> {
      if (!input.name || !input.email || !input.bsvIdentityKey) {
        throw new ValidationError('name, email, and bsvIdentityKey are required')
      }

      if (!IDENTITY_KEY_REGEX.test(input.bsvIdentityKey)) {
        throw new ValidationError('bsvIdentityKey must be a valid compressed public key (66 hex chars starting with 02 or 03)')
      }

      const existing = await db('tenants')
        .where('email', input.email)
        .orWhere('bsv_identity_key', input.bsvIdentityKey)
        .first()

      if (existing) {
        throw new ConflictError('A tenant with this email or identity key already exists')
      }

      const tenantId = uuid()
      const now = new Date().toISOString()

      await db('tenants').insert({
        id: tenantId,
        name: input.name,
        email: input.email,
        bsv_identity_key: input.bsvIdentityKey,
        status: 'active',
        created_at: now,
        updated_at: now
      })

      const apiKey = generateApiKey()
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')

      await db('api_keys').insert({
        id: uuid(),
        tenant_id: tenantId,
        key_hash: keyHash,
        prefix: apiKey.slice(0, 8),
        scopes: JSON.stringify(DEFAULT_SCOPES),
        label: 'Default API key'
      })

      const tenant = await this.getById(tenantId)
      return { tenant: tenant!, apiKey }
    },

    async getById (id: string): Promise<Tenant | null> {
      const row = await db('tenants').where('id', id).first()
      if (!row) return null

      return {
        id: row.id,
        name: row.name,
        email: row.email,
        bsvIdentityKey: row.bsv_identity_key,
        channelEndpointUrl: row.channel_endpoint_url,
        webhookUrl: row.webhook_url,
        webhookSecret: row.webhook_secret,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    },

    async update (id: string, input: UpdateTenantRequest): Promise<Tenant> {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.name !== undefined) updates.name = input.name
      if (input.webhookUrl !== undefined) updates.webhook_url = input.webhookUrl
      if (input.channelEndpointUrl !== undefined) updates.channel_endpoint_url = input.channelEndpointUrl

      await db('tenants').where('id', id).update(updates)
      return (await this.getById(id))!
    },

    async createApiKey (tenantId: string, input: CreateApiKeyRequest): Promise<{ id: string; apiKey: string; label: string }> {
      if (!input.label || !input.scopes?.length) {
        throw new ValidationError('label and scopes are required')
      }

      const apiKey = generateApiKey()
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')
      const keyId = uuid()

      await db('api_keys').insert({
        id: keyId,
        tenant_id: tenantId,
        key_hash: keyHash,
        prefix: apiKey.slice(0, 8),
        scopes: JSON.stringify(input.scopes),
        label: input.label,
        expires_at: input.expiresAt ?? null
      })

      return { id: keyId, apiKey, label: input.label }
    },

    async deleteApiKey (tenantId: string, keyId: string): Promise<void> {
      const deleted = await db('api_keys')
        .where('id', keyId)
        .where('tenant_id', tenantId)
        .del()

      if (!deleted) {
        throw new ValidationError('API key not found')
      }
    }
  }
}
```

- [ ] **Step 4: Implement tenant routes**

Create `src/modules/tenants/routes.ts`:

```typescript
import { Router } from 'express'
import type { Knex } from 'knex'
import { createApiKeyAuth } from '../auth/api-key-auth.js'
import { createTenantService } from './service.js'

export function createTenantRoutes (db: Knex): Router {
  const router = Router()
  const auth = createApiKeyAuth(db)
  const service = createTenantService(db)

  // POST / — register (no auth required)
  router.post('/', async (req, res, next) => {
    try {
      const result = await service.register(req.body)
      res.status(201).json(result)
    } catch (err) { next(err) }
  })

  // GET /me — get own profile
  router.get('/me', auth, async (req, res, next) => {
    try {
      const tenant = await service.getById(req.tenant!.id)
      res.json(tenant)
    } catch (err) { next(err) }
  })

  // PATCH /me — update profile
  router.patch('/me', auth, async (req, res, next) => {
    try {
      const tenant = await service.update(req.tenant!.id, req.body)
      res.json(tenant)
    } catch (err) { next(err) }
  })

  // POST /me/api-keys — create additional key
  router.post('/me/api-keys', auth, async (req, res, next) => {
    try {
      const result = await service.createApiKey(req.tenant!.id, req.body)
      res.status(201).json(result)
    } catch (err) { next(err) }
  })

  // DELETE /me/api-keys/:id — revoke key
  router.delete('/me/api-keys/:id', auth, async (req, res, next) => {
    try {
      await service.deleteApiKey(req.tenant!.id, req.params.id)
      res.json({ status: 'deleted' })
    } catch (err) { next(err) }
  })

  return router
}
```

- [ ] **Step 5: Mount tenant routes in app.ts**

In `src/app.ts`, add import and mount:

```typescript
import { createTenantRoutes } from './modules/tenants/routes.js'
```

And inside `createApp()`, before the 404 handler:

```typescript
  app.use('/v1/tenants', createTenantRoutes(db))
```

- [ ] **Step 6: Run tenants tests**

Run: `npx jest src/modules/tenants/__tests__/tenants.test.ts --no-cache`
Expected: All 8 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/modules/tenants src/app.ts
git commit -m "feat: add tenants module with registration, API keys, and profile management"
```

---

### Task 7: Users Module

**Files:**
- Create: `src/modules/users/types.ts`
- Create: `src/modules/users/service.ts`
- Create: `src/modules/users/routes.ts`
- Create: `src/modules/users/__tests__/users.test.ts`

- [ ] **Step 1: Write users tests**

Create `src/modules/users/__tests__/users.test.ts`:

```typescript
import request from 'supertest'
import { v4 as uuid } from 'uuid'
import { createTestContext, type TestContext } from '../../../test/helpers.js'

describe('Users API', () => {
  let ctx: TestContext
  const validIdentityKey = '02' + 'ab'.repeat(32)

  beforeEach(async () => {
    ctx = await createTestContext()
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  describe('POST /v1/users', () => {
    test('registers a new user with identity key', async () => {
      const res = await request(ctx.app)
        .post('/v1/users')
        .set('x-bsv-identity-key', validIdentityKey)

      expect(res.status).toBe(201)
      expect(res.body.id).toBeDefined()
      expect(res.body.bsvIdentityKey).toBe(validIdentityKey)
      expect(res.body.status).toBe('active')
    })

    test('returns existing user on duplicate registration', async () => {
      const res1 = await request(ctx.app)
        .post('/v1/users')
        .set('x-bsv-identity-key', validIdentityKey)

      const res2 = await request(ctx.app)
        .post('/v1/users')
        .set('x-bsv-identity-key', validIdentityKey)

      expect(res2.status).toBe(200)
      expect(res2.body.id).toBe(res1.body.id)
    })

    test('rejects missing identity key', async () => {
      const res = await request(ctx.app).post('/v1/users')
      expect(res.status).toBe(401)
    })

    test('rejects invalid identity key format', async () => {
      const res = await request(ctx.app)
        .post('/v1/users')
        .set('x-bsv-identity-key', 'not-valid')
      expect(res.status).toBe(401)
    })
  })

  describe('GET /v1/users/me', () => {
    test('returns user profile', async () => {
      // Register first
      await request(ctx.app)
        .post('/v1/users')
        .set('x-bsv-identity-key', validIdentityKey)

      const res = await request(ctx.app)
        .get('/v1/users/me')
        .set('x-bsv-identity-key', validIdentityKey)

      expect(res.status).toBe(200)
      expect(res.body.bsvIdentityKey).toBe(validIdentityKey)
    })

    test('rejects unregistered user', async () => {
      const res = await request(ctx.app)
        .get('/v1/users/me')
        .set('x-bsv-identity-key', '03' + 'ff'.repeat(32))

      expect(res.status).toBe(401)
    })
  })
})
```

- [ ] **Step 2: Implement user types**

Create `src/modules/users/types.ts`:

```typescript
export interface User {
  id: string
  bsvIdentityKey: string
  email: string | null
  rampCustomerId: string | null
  status: 'active' | 'suspended'
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 3: Implement user service**

Create `src/modules/users/service.ts`:

```typescript
import { v4 as uuid } from 'uuid'
import type { Knex } from 'knex'
import type { User } from './types.js'

export function createUserService (db: Knex) {
  return {
    async findOrCreate (bsvIdentityKey: string): Promise<{ user: User; created: boolean }> {
      const existing = await db('users').where('bsv_identity_key', bsvIdentityKey).first()

      if (existing) {
        return { user: this.toUser(existing), created: false }
      }

      const now = new Date().toISOString()
      const id = uuid()

      await db('users').insert({
        id,
        bsv_identity_key: bsvIdentityKey,
        status: 'active',
        created_at: now,
        updated_at: now
      })

      const row = await db('users').where('id', id).first()
      return { user: this.toUser(row), created: true }
    },

    async getByIdentityKey (bsvIdentityKey: string): Promise<User | null> {
      const row = await db('users').where('bsv_identity_key', bsvIdentityKey).first()
      if (!row) return null
      return this.toUser(row)
    },

    toUser (row: any): User {
      return {
        id: row.id,
        bsvIdentityKey: row.bsv_identity_key,
        email: row.email,
        rampCustomerId: row.ramp_customer_id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    }
  }
}
```

- [ ] **Step 4: Implement user routes**

Create `src/modules/users/routes.ts`:

```typescript
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

  // POST / — register (or return existing). Uses identity key header directly, not identityAuth middleware (since user may not exist yet)
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

  // GET /me — get profile (requires registered user)
  router.get('/me', identityAuth, async (req, res, next) => {
    try {
      const user = await service.getByIdentityKey(req.user!.bsvIdentityKey)
      res.json(user)
    } catch (err) { next(err) }
  })

  return router
}
```

- [ ] **Step 5: Mount user routes in app.ts**

In `src/app.ts`, add import and mount:

```typescript
import { createUserRoutes } from './modules/users/routes.js'
```

And add the mount before the 404 handler:

```typescript
  app.use('/v1/users', createUserRoutes(db))
```

- [ ] **Step 6: Run users tests**

Run: `npx jest src/modules/users/__tests__/users.test.ts --no-cache`
Expected: All 5 tests PASS

- [ ] **Step 7: Run full test suite**

Run: `npx jest --no-cache`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/modules/users src/app.ts
git commit -m "feat: add users module with identity-based registration and profile"
```

---

### Task 8: Final Verification + Initial Push

**Files:**
- No new files

- [ ] **Step 1: Run full test suite**

Run: `npx jest --no-cache`
Expected: All tests pass

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Push to GitHub**

```bash
git push -u origin main
```

- [ ] **Step 4: Verify**

Run: `gh repo view b1narydt/channelmint --web`
