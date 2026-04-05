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
