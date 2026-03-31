import { v4 as uuid } from 'uuid'
import type { Knex } from 'knex'
import { ValidationError, NotFoundError } from '../../shared/errors.js'
import type { ServiceListing, CreateServiceRequest, UpdateServiceRequest } from './types.js'

export function createDiscoveryService (db: Knex) {
  return {
    async createService (tenantId: string, input: CreateServiceRequest): Promise<ServiceListing> {
      if (!input.name || !input.description || !input.category || !input.channelEndpointUrl) {
        throw new ValidationError('name, description, category, and channelEndpointUrl are required')
      }

      const id = uuid()
      const now = new Date().toISOString()

      await db('service_listings').insert({
        id,
        tenant_id: tenantId,
        name: input.name,
        description: input.description,
        category: input.category,
        channel_endpoint_url: input.channelEndpointUrl,
        thumbnail_url: input.thumbnailUrl ?? null,
        tags: JSON.stringify(input.tags ?? []),
        status: 'active',
        created_at: now,
        updated_at: now
      })

      return this.toListing(await db('service_listings').where('id', id).first())
    },

    async listOwnServices (tenantId: string): Promise<ServiceListing[]> {
      const rows = await db('service_listings').where('tenant_id', tenantId)
      return rows.map((r: any) => this.toListing(r))
    },

    async updateService (tenantId: string, serviceId: string, input: UpdateServiceRequest): Promise<ServiceListing> {
      const fields: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.name !== undefined) fields.name = input.name
      if (input.description !== undefined) fields.description = input.description
      if (input.category !== undefined) fields.category = input.category
      if (input.channelEndpointUrl !== undefined) fields.channel_endpoint_url = input.channelEndpointUrl
      if (input.thumbnailUrl !== undefined) fields.thumbnail_url = input.thumbnailUrl
      if (input.tags !== undefined) fields.tags = JSON.stringify(input.tags)
      if (input.status !== undefined) fields.status = input.status

      const count = await db('service_listings')
        .where({ id: serviceId, tenant_id: tenantId })
        .update(fields)

      if (!count) throw new NotFoundError('Service listing not found')
      return this.toListing(await db('service_listings').where('id', serviceId).first())
    },

    async deleteService (tenantId: string, serviceId: string): Promise<void> {
      const count = await db('service_listings')
        .where({ id: serviceId, tenant_id: tenantId })
        .del()

      if (!count) throw new NotFoundError('Service listing not found')
    },

    async browseCatalog (category?: string): Promise<ServiceListing[]> {
      let query = db('service_listings').where('status', 'active')
      if (category) {
        query = query.where('category', category)
      }
      const rows = await query.orderBy('created_at', 'desc')
      return rows.map((r: any) => this.toListing(r))
    },

    async searchCatalog (term: string): Promise<ServiceListing[]> {
      const rows = await db('service_listings')
        .where('status', 'active')
        .where(function () {
          this.where('name', 'like', `%${term}%`)
            .orWhere('description', 'like', `%${term}%`)
            .orWhere('tags', 'like', `%${term}%`)
        })
        .orderBy('created_at', 'desc')

      return rows.map((r: any) => this.toListing(r))
    },

    async getService (serviceId: string): Promise<ServiceListing> {
      const row = await db('service_listings')
        .where({ id: serviceId, status: 'active' })
        .first()

      if (!row) throw new NotFoundError('Service listing not found')
      return this.toListing(row)
    },

    toListing (row: any): ServiceListing {
      return {
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        description: row.description,
        category: row.category,
        channelEndpointUrl: row.channel_endpoint_url,
        thumbnailUrl: row.thumbnail_url,
        tags: JSON.parse(row.tags),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    }
  }
}
