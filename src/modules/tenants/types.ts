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
