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
