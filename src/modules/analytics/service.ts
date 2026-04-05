import { v4 as uuid } from 'uuid'
import type { Knex } from 'knex'
import type { UsageSummary, IngestEventsRequest } from './types.js'

function getDayBucket (timestamp: number): { periodStart: string; periodEnd: string } {
  const d = new Date(timestamp)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const end = new Date(start.getTime() + 86400000)
  return {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString()
  }
}

export function createAnalyticsService (db: Knex) {
  return {
    async ingestEvents (tenantId: string, events: IngestEventsRequest['events']): Promise<{ ingested: number }> {
      let ingested = 0

      for (const event of events) {
        const eventId = uuid()
        const ts = new Date(event.timestamp).toISOString()

        // Dedup check
        const dedup = await db('channel_events')
          .where({
            tenant_id: tenantId,
            channel_id: event.channelId,
            event_type: event.eventType
          })
          .modify((qb: any) => {
            if (event.eventType === 'channel.updated' && event.payload?.sequence != null) {
              qb.whereRaw("json_extract(payload, '$.sequence') = ?", [event.payload.sequence])
            }
          })
          .first()

        if (dedup) continue

        await db('channel_events').insert({
          id: eventId,
          tenant_id: tenantId,
          event_type: event.eventType,
          channel_id: event.channelId,
          consumer_identity_key: event.consumerIdentityKey,
          content_id: event.contentId,
          payload: JSON.stringify(event.payload),
          timestamp: ts
        })

        // Update usage summaries
        const { periodStart, periodEnd } = getDayBucket(event.timestamp)

        const existing = await db('usage_summaries')
          .where({
            tenant_id: tenantId,
            consumer_identity_key: event.consumerIdentityKey,
            period_start: periodStart
          })
          .first()

        if (event.eventType === 'channel.updated') {
          const satsPaid = typeof event.payload?.satoshisPaid === 'number' ? event.payload.satoshisPaid : 0

          if (existing) {
            await db('usage_summaries').where('id', existing.id).update({
              total_satoshis_paid: existing.total_satoshis_paid + satsPaid,
              total_requests: existing.total_requests + 1,
              updated_at: new Date().toISOString()
            })
          } else {
            await db('usage_summaries').insert({
              id: uuid(),
              tenant_id: tenantId,
              consumer_identity_key: event.consumerIdentityKey,
              period_start: periodStart,
              period_end: periodEnd,
              total_satoshis_paid: satsPaid,
              total_requests: 1,
              channel_count: 0
            })
          }
        }

        if (event.eventType === 'channel.opened') {
          if (existing) {
            await db('usage_summaries').where('id', existing.id).update({
              channel_count: existing.channel_count + 1,
              updated_at: new Date().toISOString()
            })
          } else {
            await db('usage_summaries').insert({
              id: uuid(),
              tenant_id: tenantId,
              consumer_identity_key: event.consumerIdentityKey,
              period_start: periodStart,
              period_end: periodEnd,
              total_satoshis_paid: 0,
              total_requests: 0,
              channel_count: 1
            })
          }
        }

        ingested++
      }

      return { ingested }
    },

    async getRevenue (tenantId: string, periodStart?: string, periodEnd?: string): Promise<Array<{ period: string; totalSatoshis: number }>> {
      let query = db('usage_summaries').where('tenant_id', tenantId)
      if (periodStart) query = query.where('period_start', '>=', periodStart)
      if (periodEnd) query = query.where('period_start', '<=', periodEnd)

      const rows = await query
        .groupBy('period_start')
        .select('period_start')
        .sum('total_satoshis_paid as totalSatoshis')
        .orderBy('period_start', 'asc')

      return rows.map((r: any) => ({ period: r.period_start, totalSatoshis: r.totalSatoshis || 0 }))
    },

    async getUsage (tenantId: string, periodStart?: string, periodEnd?: string): Promise<Array<{ period: string; totalRequests: number; channelCount: number }>> {
      let query = db('usage_summaries').where('tenant_id', tenantId)
      if (periodStart) query = query.where('period_start', '>=', periodStart)
      if (periodEnd) query = query.where('period_start', '<=', periodEnd)

      const rows = await query
        .groupBy('period_start')
        .select('period_start')
        .sum('total_requests as totalRequests')
        .sum('channel_count as channelCount')
        .orderBy('period_start', 'asc')

      return rows.map((r: any) => ({ period: r.period_start, totalRequests: r.totalRequests || 0, channelCount: r.channelCount || 0 }))
    },

    async getUserSpending (tenantId: string, consumerIdentityKey: string): Promise<UsageSummary[]> {
      const rows = await db('usage_summaries')
        .where({ tenant_id: tenantId, consumer_identity_key: consumerIdentityKey })
        .orderBy('period_start', 'desc')

      return rows.map((r: any) => this.toSummary(r))
    },

    async getSpendingAcrossTenants (consumerIdentityKey: string): Promise<UsageSummary[]> {
      const rows = await db('usage_summaries')
        .where('consumer_identity_key', consumerIdentityKey)
        .orderBy('period_start', 'desc')

      return rows.map((r: any) => this.toSummary(r))
    },

    toSummary (row: any): UsageSummary {
      return {
        id: row.id,
        tenantId: row.tenant_id,
        consumerIdentityKey: row.consumer_identity_key,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        totalSatoshisPaid: row.total_satoshis_paid,
        totalRequests: row.total_requests,
        channelCount: row.channel_count,
        updatedAt: row.updated_at
      }
    }
  }
}
