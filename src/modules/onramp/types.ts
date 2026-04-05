export interface Purchase {
  id: string
  userId: string
  rampPurchaseId: string | null
  rampViewToken: string | null
  targetAddress: string
  fiatAmount: number | null
  fiatCurrency: string | null
  bsvAmount: number | null
  status: 'pending' | 'released' | 'returned' | 'expired'
  rampWebhookPayload: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface CreateSessionRequest {
  receivingAddress: string
  fiatCurrency?: string
}

export interface RampWidgetConfig {
  hostAppName: string
  enabledCryptoAssets: string
  userAddress: string
  inAsset: string
  defaultFlow: string
  purchaseId: string
}
