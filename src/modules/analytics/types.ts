export interface ChannelEvent {
  id: string
  tenantId: string
  eventType: 'channel.opened' | 'channel.updated' | 'channel.closed' | 'channel.failed'
  channelId: string
  consumerIdentityKey: string
  contentId: string
  payload: Record<string, unknown>
  timestamp: string
  createdAt: string
}

export interface UsageSummary {
  id: string
  tenantId: string
  consumerIdentityKey: string
  periodStart: string
  periodEnd: string
  totalSatoshisPaid: number
  totalRequests: number
  channelCount: number
  updatedAt: string
}

export interface IngestEventsRequest {
  tenantId: string
  events: Array<{
    eventType: string
    channelId: string
    consumerIdentityKey: string
    contentId: string
    payload: Record<string, unknown>
    timestamp: number
  }>
}
