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
