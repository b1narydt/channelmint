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
