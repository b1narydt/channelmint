# Phase 2: Billing Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the billing module — products, rate cards, rates, content pricing rules, and the `/v1/billing/config/:contentId` endpoint that `RemoteChannelProvider` calls from tenant middleware instances.

**Architecture:** New `billing` module under `src/modules/billing/` following the existing module pattern (types, service, routes, tests). Four new DB tables. The `/config/:contentId` endpoint is the critical integration point — it resolves a content path to a `ChannelConfig` (chunkPrice + recipients) using content pricing rules and rate cards.

**Tech Stack:** Same as Phase 1 — Express 5, Knex, better-sqlite3 (test), Jest, supertest

---

## File Structure

```
src/modules/billing/
├── types.ts                    # Product, RateCard, Rate, ContentPricing interfaces
├── service.ts                  # CRUD + config resolution logic
├── routes.ts                   # All billing API routes + /config/:contentId
└── __tests__/
    ├── billing-crud.test.ts    # Product, rate card, rate CRUD tests
    ├── content-pricing.test.ts # Content pricing + config resolution tests
```

New migrations:
```
src/db/migrations/
├── 004_create_products.ts
├── 005_create_rate_cards.ts
├── 006_create_rates.ts
└── 007_create_content_pricing.ts
```

---

### Task 1: Database Migrations for Billing Tables

**Files:**
- Create: `src/db/migrations/004_create_products.ts`
- Create: `src/db/migrations/005_create_rate_cards.ts`
- Create: `src/db/migrations/006_create_rates.ts`
- Create: `src/db/migrations/007_create_content_pricing.ts`
- Modify: `src/db/migrate.ts` — add new migrations
- Modify: `src/db/rollback.ts` — add new rollbacks
- Modify: `src/test/helpers.ts` — run new migrations in test context
- Create: `src/db/__tests__/billing-migrations.test.ts`

- [ ] **Step 1: Write migration tests**

Create `src/db/__tests__/billing-migrations.test.ts`:

```typescript
import { createTestDatabase } from '../connection.js'
import type { Knex } from 'knex'
import { up as upTenants } from '../migrations/001_create_tenants.js'
import { up as upProducts, down as downProducts } from '../migrations/004_create_products.js'
import { up as upRateCards, down as downRateCards } from '../migrations/005_create_rate_cards.js'
import { up as upRates, down as downRates } from '../migrations/006_create_rates.js'
import { up as upContentPricing, down as downContentPricing } from '../migrations/007_create_content_pricing.js'

describe('billing migrations', () => {
  let db: Knex

  beforeEach(async () => {
    db = createTestDatabase()
    await upTenants(db)
  })

  afterEach(async () => {
    await db.destroy()
  })

  test('004: creates products table', async () => {
    await upProducts(db)
    const cols = await db('products').columnInfo()
    expect(cols).toHaveProperty('id')
    expect(cols).toHaveProperty('tenant_id')
    expect(cols).toHaveProperty('name')
    expect(cols).toHaveProperty('unit_name')
    expect(cols).toHaveProperty('status')
    expect(cols).toHaveProperty('created_at')
  })

  test('005: creates rate_cards table', async () => {
    await upRateCards(db)
    const cols = await db('rate_cards').columnInfo()
    expect(cols).toHaveProperty('id')
    expect(cols).toHaveProperty('tenant_id')
    expect(cols).toHaveProperty('name')
    expect(cols).toHaveProperty('description')
    expect(cols).toHaveProperty('status')
    expect(cols).toHaveProperty('created_at')
  })

  test('006: creates rates table', async () => {
    await upProducts(db)
    await upRateCards(db)
    await upRates(db)
    const cols = await db('rates').columnInfo()
    expect(cols).toHaveProperty('id')
    expect(cols).toHaveProperty('rate_card_id')
    expect(cols).toHaveProperty('product_id')
    expect(cols).toHaveProperty('price_per_unit')
    expect(cols).toHaveProperty('tier_floor')
    expect(cols).toHaveProperty('dimension_key')
    expect(cols).toHaveProperty('dimension_value')
    expect(cols).toHaveProperty('effective_at')
    expect(cols).toHaveProperty('created_at')
  })

  test('007: creates content_pricing table', async () => {
    await upProducts(db)
    await upRateCards(db)
    await upContentPricing(db)
    const cols = await db('content_pricing').columnInfo()
    expect(cols).toHaveProperty('id')
    expect(cols).toHaveProperty('tenant_id')
    expect(cols).toHaveProperty('rate_card_id')
    expect(cols).toHaveProperty('content_pattern')
    expect(cols).toHaveProperty('product_id')
    expect(cols).toHaveProperty('recipients')
    expect(cols).toHaveProperty('priority')
    expect(cols).toHaveProperty('status')
    expect(cols).toHaveProperty('created_at')
  })

  test('all billing migrations run and rollback', async () => {
    await upProducts(db)
    await upRateCards(db)
    await upRates(db)
    await upContentPricing(db)

    expect(await db.schema.hasTable('products')).toBe(true)
    expect(await db.schema.hasTable('rate_cards')).toBe(true)
    expect(await db.schema.hasTable('rates')).toBe(true)
    expect(await db.schema.hasTable('content_pricing')).toBe(true)

    await downContentPricing(db)
    await downRates(db)
    await downRateCards(db)
    await downProducts(db)

    expect(await db.schema.hasTable('products')).toBe(false)
    expect(await db.schema.hasTable('rate_cards')).toBe(false)
    expect(await db.schema.hasTable('rates')).toBe(false)
    expect(await db.schema.hasTable('content_pricing')).toBe(false)
  })
})
```

- [ ] **Step 2: Implement migrations**

`src/db/migrations/004_create_products.ts`:
```typescript
import type { Knex } from 'knex'

export async function up (db: Knex): Promise<void> {
  await db.schema.createTable('products', (t) => {
    t.uuid('id').primary()
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE')
    t.string('name').notNullable()
    t.string('unit_name').notNullable()
    t.string('status').notNullable().defaultTo('active')
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now())
    t.index(['tenant_id', 'status'])
  })
}

export async function down (db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('products')
}
```

`src/db/migrations/005_create_rate_cards.ts`:
```typescript
import type { Knex } from 'knex'

export async function up (db: Knex): Promise<void> {
  await db.schema.createTable('rate_cards', (t) => {
    t.uuid('id').primary()
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE')
    t.string('name').notNullable()
    t.text('description').nullable()
    t.string('status').notNullable().defaultTo('active')
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now())
    t.index(['tenant_id', 'status'])
  })
}

export async function down (db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('rate_cards')
}
```

`src/db/migrations/006_create_rates.ts`:
```typescript
import type { Knex } from 'knex'

export async function up (db: Knex): Promise<void> {
  await db.schema.createTable('rates', (t) => {
    t.uuid('id').primary()
    t.uuid('rate_card_id').notNullable().references('id').inTable('rate_cards').onDelete('CASCADE')
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE')
    t.integer('price_per_unit').notNullable()
    t.integer('tier_floor').nullable()
    t.string('dimension_key').nullable()
    t.string('dimension_value').nullable()
    t.timestamp('effective_at').notNullable()
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now())
    t.index(['rate_card_id', 'product_id', 'effective_at'])
  })
}

export async function down (db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('rates')
}
```

`src/db/migrations/007_create_content_pricing.ts`:
```typescript
import type { Knex } from 'knex'

export async function up (db: Knex): Promise<void> {
  await db.schema.createTable('content_pricing', (t) => {
    t.uuid('id').primary()
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE')
    t.uuid('rate_card_id').notNullable().references('id').inTable('rate_cards').onDelete('CASCADE')
    t.string('content_pattern').notNullable()
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE')
    t.text('recipients').notNullable()
    t.integer('priority').notNullable().defaultTo(0)
    t.string('status').notNullable().defaultTo('active')
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now())
    t.index(['tenant_id', 'status', 'priority'])
  })
}

export async function down (db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('content_pricing')
}
```

- [ ] **Step 3: Update migrate.ts, rollback.ts, and test helpers**

Add the 4 new migration imports/calls to `src/db/migrate.ts`, `src/db/rollback.ts`, and `src/test/helpers.ts`.

- [ ] **Step 4: Run migration tests**

Run: `cd /Users/donot/metanet-projects/channelmint && npx jest src/db/__tests__/billing-migrations.test.ts --no-cache`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/donot/metanet-projects/channelmint && git add src/db src/test
git commit -m "feat: add billing database migrations (products, rate_cards, rates, content_pricing)"
```

---

### Task 2: Billing Types + Service (CRUD)

**Files:**
- Create: `src/modules/billing/types.ts`
- Create: `src/modules/billing/service.ts`

- [ ] **Step 1: Implement billing types**

Create `src/modules/billing/types.ts`:

```typescript
export interface Product {
  id: string
  tenantId: string
  name: string
  unitName: string
  status: 'active' | 'archived'
  createdAt: string
}

export interface RateCard {
  id: string
  tenantId: string
  name: string
  description: string | null
  status: 'active' | 'archived'
  createdAt: string
}

export interface Rate {
  id: string
  rateCardId: string
  productId: string
  pricePerUnit: number
  tierFloor: number | null
  dimensionKey: string | null
  dimensionValue: string | null
  effectiveAt: string
  createdAt: string
}

export interface ContentPricing {
  id: string
  tenantId: string
  rateCardId: string
  contentPattern: string
  productId: string
  recipients: RecipientConfig[]
  priority: number
  status: 'active' | 'archived'
  createdAt: string
}

export interface RecipientConfig {
  name: string
  identityKey?: string
  address?: string
  percentage: number
}

export interface CreateProductRequest {
  name: string
  unitName: string
}

export interface CreateRateCardRequest {
  name: string
  description?: string
}

export interface AddRateRequest {
  productId: string
  pricePerUnit: number
  tierFloor?: number
  dimensionKey?: string
  dimensionValue?: string
  effectiveAt: string
}

export interface CreateContentPricingRequest {
  rateCardId: string
  contentPattern: string
  productId: string
  recipients: RecipientConfig[]
  priority?: number
}

/** Matches channel-express-middleware ChannelConfig exactly */
export interface ChannelConfig {
  chunkPrice: number
  recipients: RecipientConfig[]
}
```

- [ ] **Step 2: Implement billing service**

Create `src/modules/billing/service.ts` with these methods:

- `createProduct(tenantId, input)` — validates name + unitName, inserts, returns Product
- `listProducts(tenantId)` — returns active products for tenant
- `updateProduct(tenantId, productId, updates)` — partial update (name, status)
- `createRateCard(tenantId, input)` — validates name, inserts, returns RateCard
- `listRateCards(tenantId)` — returns active rate cards for tenant
- `addRate(tenantId, rateCardId, input)` — validates rate card + product ownership, inserts rate (append-only)
- `listRates(rateCardId, tenantId)` — returns rates for a rate card, ordered by effective_at desc
- `createContentPricing(tenantId, input)` — validates refs, inserts content pricing rule
- `listContentPricing(tenantId)` — returns active content pricing rules
- `updateContentPricing(tenantId, id, updates)` — partial update (status)
- `resolveConfig(tenantId, contentId)` — THE KEY METHOD: matches contentId against content_pricing rules (by priority), resolves current rate from rate card, returns `ChannelConfig` or null

The `resolveConfig` method:
1. Load all active content_pricing rules for tenant, ordered by priority DESC
2. For each rule, check if `contentId` matches `contentPattern` (exact match or glob with `*` wildcard)
3. On first match: look up the rate card's current effective rate for that product (most recent `effective_at <= now`)
4. Return `{ chunkPrice: rate.price_per_unit, recipients: rule.recipients }`
5. If no match, return null

Glob matching: `*` matches any sequence of characters. `/api/v1/*` matches `/api/v1/anything`. Exact strings match exactly.

```typescript
import { v4 as uuid } from 'uuid'
import type { Knex } from 'knex'
import { ValidationError, NotFoundError } from '../../shared/errors.js'
import type {
  Product, RateCard, Rate, ContentPricing, ChannelConfig,
  CreateProductRequest, CreateRateCardRequest, AddRateRequest, CreateContentPricingRequest
} from './types.js'

function globMatch (pattern: string, value: string): boolean {
  if (!pattern.includes('*')) return pattern === value
  const regex = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
  return regex.test(value)
}

export function createBillingService (db: Knex) {
  return {
    // --- Products ---
    async createProduct (tenantId: string, input: CreateProductRequest): Promise<Product> {
      if (!input.name || !input.unitName) {
        throw new ValidationError('name and unitName are required')
      }
      const id = uuid()
      const now = new Date().toISOString()
      await db('products').insert({
        id, tenant_id: tenantId, name: input.name, unit_name: input.unitName,
        status: 'active', created_at: now
      })
      return this.toProduct(await db('products').where('id', id).first())
    },

    async listProducts (tenantId: string): Promise<Product[]> {
      const rows = await db('products').where({ tenant_id: tenantId, status: 'active' })
      return rows.map((r: any) => this.toProduct(r))
    },

    async updateProduct (tenantId: string, productId: string, updates: { name?: string; status?: string }): Promise<Product> {
      const fields: Record<string, unknown> = {}
      if (updates.name !== undefined) fields.name = updates.name
      if (updates.status !== undefined) fields.status = updates.status
      if (Object.keys(fields).length === 0) throw new ValidationError('No fields to update')

      const count = await db('products').where({ id: productId, tenant_id: tenantId }).update(fields)
      if (!count) throw new NotFoundError('Product not found')
      return this.toProduct(await db('products').where('id', productId).first())
    },

    // --- Rate Cards ---
    async createRateCard (tenantId: string, input: CreateRateCardRequest): Promise<RateCard> {
      if (!input.name) throw new ValidationError('name is required')
      const id = uuid()
      const now = new Date().toISOString()
      await db('rate_cards').insert({
        id, tenant_id: tenantId, name: input.name,
        description: input.description ?? null, status: 'active', created_at: now
      })
      return this.toRateCard(await db('rate_cards').where('id', id).first())
    },

    async listRateCards (tenantId: string): Promise<RateCard[]> {
      const rows = await db('rate_cards').where({ tenant_id: tenantId, status: 'active' })
      return rows.map((r: any) => this.toRateCard(r))
    },

    // --- Rates ---
    async addRate (tenantId: string, rateCardId: string, input: AddRateRequest): Promise<Rate> {
      if (!input.productId || input.pricePerUnit === undefined || !input.effectiveAt) {
        throw new ValidationError('productId, pricePerUnit, and effectiveAt are required')
      }
      const rc = await db('rate_cards').where({ id: rateCardId, tenant_id: tenantId }).first()
      if (!rc) throw new NotFoundError('Rate card not found')
      const product = await db('products').where({ id: input.productId, tenant_id: tenantId }).first()
      if (!product) throw new NotFoundError('Product not found')

      const id = uuid()
      const now = new Date().toISOString()
      await db('rates').insert({
        id, rate_card_id: rateCardId, product_id: input.productId,
        price_per_unit: input.pricePerUnit,
        tier_floor: input.tierFloor ?? null,
        dimension_key: input.dimensionKey ?? null,
        dimension_value: input.dimensionValue ?? null,
        effective_at: input.effectiveAt, created_at: now
      })
      return this.toRate(await db('rates').where('id', id).first())
    },

    async listRates (tenantId: string, rateCardId: string): Promise<Rate[]> {
      const rc = await db('rate_cards').where({ id: rateCardId, tenant_id: tenantId }).first()
      if (!rc) throw new NotFoundError('Rate card not found')
      const rows = await db('rates').where('rate_card_id', rateCardId).orderBy('effective_at', 'desc')
      return rows.map((r: any) => this.toRate(r))
    },

    // --- Content Pricing ---
    async createContentPricing (tenantId: string, input: CreateContentPricingRequest): Promise<ContentPricing> {
      if (!input.rateCardId || !input.contentPattern || !input.productId || !input.recipients?.length) {
        throw new ValidationError('rateCardId, contentPattern, productId, and recipients are required')
      }
      const rc = await db('rate_cards').where({ id: input.rateCardId, tenant_id: tenantId }).first()
      if (!rc) throw new NotFoundError('Rate card not found')
      const product = await db('products').where({ id: input.productId, tenant_id: tenantId }).first()
      if (!product) throw new NotFoundError('Product not found')

      const totalPct = input.recipients.reduce((sum, r) => sum + r.percentage, 0)
      if (totalPct !== 100) throw new ValidationError('Recipient percentages must sum to 100')

      const id = uuid()
      const now = new Date().toISOString()
      await db('content_pricing').insert({
        id, tenant_id: tenantId, rate_card_id: input.rateCardId,
        content_pattern: input.contentPattern, product_id: input.productId,
        recipients: JSON.stringify(input.recipients),
        priority: input.priority ?? 0, status: 'active', created_at: now
      })
      return this.toContentPricing(await db('content_pricing').where('id', id).first())
    },

    async listContentPricing (tenantId: string): Promise<ContentPricing[]> {
      const rows = await db('content_pricing').where({ tenant_id: tenantId, status: 'active' }).orderBy('priority', 'desc')
      return rows.map((r: any) => this.toContentPricing(r))
    },

    async updateContentPricing (tenantId: string, id: string, updates: { status?: string }): Promise<ContentPricing> {
      if (!updates.status) throw new ValidationError('No fields to update')
      const count = await db('content_pricing').where({ id, tenant_id: tenantId }).update({ status: updates.status })
      if (!count) throw new NotFoundError('Content pricing rule not found')
      return this.toContentPricing(await db('content_pricing').where('id', id).first())
    },

    // --- Config Resolution (called by RemoteChannelProvider) ---
    async resolveConfig (tenantId: string, contentId: string): Promise<ChannelConfig | null> {
      const rules = await db('content_pricing')
        .where({ tenant_id: tenantId, status: 'active' })
        .orderBy('priority', 'desc')

      for (const rule of rules) {
        if (!globMatch(rule.content_pattern, contentId)) continue

        const now = new Date().toISOString()
        const rate = await db('rates')
          .where('rate_card_id', rule.rate_card_id)
          .where('product_id', rule.product_id)
          .where('effective_at', '<=', now)
          .whereNull('tier_floor')
          .whereNull('dimension_key')
          .orderBy('effective_at', 'desc')
          .first()

        if (!rate) continue

        return {
          chunkPrice: rate.price_per_unit,
          recipients: JSON.parse(rule.recipients)
        }
      }

      return null
    },

    // --- Row mappers ---
    toProduct (row: any): Product {
      return {
        id: row.id, tenantId: row.tenant_id, name: row.name,
        unitName: row.unit_name, status: row.status, createdAt: row.created_at
      }
    },

    toRateCard (row: any): RateCard {
      return {
        id: row.id, tenantId: row.tenant_id, name: row.name,
        description: row.description, status: row.status, createdAt: row.created_at
      }
    },

    toRate (row: any): Rate {
      return {
        id: row.id, rateCardId: row.rate_card_id, productId: row.product_id,
        pricePerUnit: row.price_per_unit, tierFloor: row.tier_floor,
        dimensionKey: row.dimension_key, dimensionValue: row.dimension_value,
        effectiveAt: row.effective_at, createdAt: row.created_at
      }
    },

    toContentPricing (row: any): ContentPricing {
      return {
        id: row.id, tenantId: row.tenant_id, rateCardId: row.rate_card_id,
        contentPattern: row.content_pattern, productId: row.product_id,
        recipients: JSON.parse(row.recipients), priority: row.priority,
        status: row.status, createdAt: row.created_at
      }
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/donot/metanet-projects/channelmint && git add src/modules/billing
git commit -m "feat: add billing types and service with CRUD + config resolution"
```

---

### Task 3: Billing Routes

**Files:**
- Create: `src/modules/billing/routes.ts`
- Modify: `src/app.ts` — mount billing routes

- [ ] **Step 1: Implement billing routes**

Create `src/modules/billing/routes.ts`:

```typescript
import { Router } from 'express'
import type { Knex } from 'knex'
import { createApiKeyAuth } from '../auth/api-key-auth.js'
import { requireScopes } from '../auth/scopes.js'
import { createBillingService } from './service.js'
import { NotFoundError } from '../../shared/errors.js'

export function createBillingRoutes (db: Knex): Router {
  const router = Router()
  const auth = createApiKeyAuth(db)
  const scopes = { read: requireScopes('billing:read'), write: requireScopes('billing:write') }
  const service = createBillingService(db)

  // --- Products ---
  router.post('/products', auth, scopes.write, async (req, res, next) => {
    try {
      const product = await service.createProduct(req.tenant!.id, req.body)
      res.status(201).json(product)
    } catch (err) { next(err) }
  })

  router.get('/products', auth, scopes.read, async (req, res, next) => {
    try {
      const products = await service.listProducts(req.tenant!.id)
      res.json(products)
    } catch (err) { next(err) }
  })

  router.patch('/products/:id', auth, scopes.write, async (req, res, next) => {
    try {
      const product = await service.updateProduct(req.tenant!.id, req.params.id as string, req.body)
      res.json(product)
    } catch (err) { next(err) }
  })

  // --- Rate Cards ---
  router.post('/rate-cards', auth, scopes.write, async (req, res, next) => {
    try {
      const rc = await service.createRateCard(req.tenant!.id, req.body)
      res.status(201).json(rc)
    } catch (err) { next(err) }
  })

  router.get('/rate-cards', auth, scopes.read, async (req, res, next) => {
    try {
      const rcs = await service.listRateCards(req.tenant!.id)
      res.json(rcs)
    } catch (err) { next(err) }
  })

  router.post('/rate-cards/:id/rates', auth, scopes.write, async (req, res, next) => {
    try {
      const rate = await service.addRate(req.tenant!.id, req.params.id as string, req.body)
      res.status(201).json(rate)
    } catch (err) { next(err) }
  })

  router.get('/rate-cards/:id/rates', auth, scopes.read, async (req, res, next) => {
    try {
      const rates = await service.listRates(req.tenant!.id, req.params.id as string)
      res.json(rates)
    } catch (err) { next(err) }
  })

  // --- Content Pricing ---
  router.post('/content-pricing', auth, scopes.write, async (req, res, next) => {
    try {
      const cp = await service.createContentPricing(req.tenant!.id, req.body)
      res.status(201).json(cp)
    } catch (err) { next(err) }
  })

  router.get('/content-pricing', auth, scopes.read, async (req, res, next) => {
    try {
      const rules = await service.listContentPricing(req.tenant!.id)
      res.json(rules)
    } catch (err) { next(err) }
  })

  router.patch('/content-pricing/:id', auth, scopes.write, async (req, res, next) => {
    try {
      const cp = await service.updateContentPricing(req.tenant!.id, req.params.id as string, req.body)
      res.json(cp)
    } catch (err) { next(err) }
  })

  // --- Config Resolution (called by RemoteChannelProvider) ---
  router.get('/config/:contentId', auth, scopes.read, async (req, res, next) => {
    try {
      const contentId = decodeURIComponent(req.params.contentId as string)
      const config = await service.resolveConfig(req.tenant!.id, contentId)
      if (!config) {
        throw new NotFoundError(`No pricing configured for content: ${contentId}`)
      }
      res.json(config)
    } catch (err) { next(err) }
  })

  return router
}
```

- [ ] **Step 2: Mount in app.ts**

Add import: `import { createBillingRoutes } from './modules/billing/routes.js'`
Add mount: `app.use('/v1/billing', createBillingRoutes(db))`

- [ ] **Step 3: Commit**

```bash
cd /Users/donot/metanet-projects/channelmint && git add src/modules/billing/routes.ts src/app.ts
git commit -m "feat: add billing routes and mount in app"
```

---

### Task 4: Billing CRUD Tests

**Files:**
- Create: `src/modules/billing/__tests__/billing-crud.test.ts`

- [ ] **Step 1: Write CRUD tests**

Create `src/modules/billing/__tests__/billing-crud.test.ts`:

Tests for:
- POST /v1/billing/products — creates product, rejects missing fields
- GET /v1/billing/products — lists products
- PATCH /v1/billing/products/:id — archives product
- POST /v1/billing/rate-cards — creates rate card
- GET /v1/billing/rate-cards — lists rate cards
- POST /v1/billing/rate-cards/:id/rates — adds rate, rejects invalid refs
- GET /v1/billing/rate-cards/:id/rates — lists rates
- POST /v1/billing/content-pricing — creates rule, rejects bad percentages
- GET /v1/billing/content-pricing — lists rules
- All routes require auth + billing:read or billing:write scope

Each test registers a tenant first to get an API key.

- [ ] **Step 2: Run tests**

Run: `cd /Users/donot/metanet-projects/channelmint && npx jest src/modules/billing/__tests__/billing-crud.test.ts --no-cache`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
cd /Users/donot/metanet-projects/channelmint && git add src/modules/billing/__tests__/billing-crud.test.ts
git commit -m "test: add billing CRUD tests"
```

---

### Task 5: Config Resolution Tests (RemoteChannelProvider endpoint)

**Files:**
- Create: `src/modules/billing/__tests__/content-pricing.test.ts`

- [ ] **Step 1: Write config resolution tests**

Create `src/modules/billing/__tests__/content-pricing.test.ts`:

Tests for `GET /v1/billing/config/:contentId`:
- Returns ChannelConfig (chunkPrice + recipients) for exact content match
- Returns ChannelConfig for glob pattern match (`/api/v1/*` matches `/api/v1/generate`)
- Returns 404 when no pricing rule matches
- Higher priority rules take precedence over lower priority
- Uses most recent effective rate (not future-dated rates)
- Requires auth with billing:read scope

- [ ] **Step 2: Run tests**

Run: `cd /Users/donot/metanet-projects/channelmint && npx jest src/modules/billing/__tests__/content-pricing.test.ts --no-cache`
Expected: All tests PASS

- [ ] **Step 3: Run full test suite**

Run: `cd /Users/donot/metanet-projects/channelmint && npx jest --no-cache`
Expected: All tests pass (Phase 1 + Phase 2)

- [ ] **Step 4: Commit**

```bash
cd /Users/donot/metanet-projects/channelmint && git add src/modules/billing/__tests__/content-pricing.test.ts
git commit -m "test: add config resolution tests for RemoteChannelProvider endpoint"
```
