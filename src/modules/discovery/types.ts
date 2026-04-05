export interface ServiceListing {
  id: string
  tenantId: string
  name: string
  description: string
  category: string
  channelEndpointUrl: string
  thumbnailUrl: string | null
  tags: string[]
  status: 'active' | 'unlisted' | 'suspended'
  createdAt: string
  updatedAt: string
}

export interface CreateServiceRequest {
  name: string
  description: string
  category: string
  channelEndpointUrl: string
  thumbnailUrl?: string
  tags?: string[]
}

export interface UpdateServiceRequest {
  name?: string
  description?: string
  category?: string
  channelEndpointUrl?: string
  thumbnailUrl?: string
  tags?: string[]
  status?: 'active' | 'unlisted'
}
