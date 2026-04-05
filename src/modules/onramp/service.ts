import { v4 as uuid } from 'uuid'
import type { Knex } from 'knex'
import { ValidationError, NotFoundError } from '../../shared/errors.js'
import type { Purchase, CreateSessionRequest, RampWidgetConfig } from './types.js'

export function createOnrampService (db: Knex) {
  return {
    async createSession (userId: string, input: CreateSessionRequest): Promise<{ purchase: Purchase; widgetConfig: RampWidgetConfig }> {
      if (!input.receivingAddress) {
        throw new ValidationError('receivingAddress is required')
      }

      const id = uuid()
      const now = new Date().toISOString()

      await db('purchases').insert({
        id,
        user_id: userId,
        target_address: input.receivingAddress,
        fiat_currency: input.fiatCurrency ?? 'USD',
        status: 'pending',
        created_at: now,
        updated_at: now
      })

      const purchase = await this.toPurchase(await db('purchases').where('id', id).first())

      const widgetConfig: RampWidgetConfig = {
        hostAppName: 'ChannelMint',
        enabledCryptoAssets: 'BSV_BSV',
        userAddress: input.receivingAddress,
        inAsset: input.fiatCurrency ?? 'USD',
        defaultFlow: 'ONRAMP',
        purchaseId: id
      }

      return { purchase, widgetConfig }
    },

    async listPurchases (userId: string): Promise<Purchase[]> {
      const rows = await db('purchases').where('user_id', userId).orderBy('created_at', 'desc')
      return rows.map((r: any) => this.toPurchase(r))
    },

    async getPurchase (userId: string, purchaseId: string): Promise<Purchase> {
      const row = await db('purchases').where({ id: purchaseId, user_id: userId }).first()
      if (!row) throw new NotFoundError('Purchase not found')
      return this.toPurchase(row)
    },

    async handleWebhook (body: { purchase?: { id?: string; cryptoAmount?: string }; type?: string; status?: string }): Promise<void> {
      const rampId = body.purchase?.id
      if (!rampId) return

      const row = await db('purchases')
        .where('ramp_purchase_id', rampId)
        .orWhere('id', rampId)
        .first()

      if (!row) return

      const updates: Record<string, unknown> = {
        ramp_purchase_id: rampId,
        ramp_webhook_payload: JSON.stringify(body),
        updated_at: new Date().toISOString()
      }

      const eventStatus = body.type ?? body.status ?? ''
      if (eventStatus === 'RELEASED') {
        updates.status = 'released'
        if (body.purchase?.cryptoAmount) {
          updates.bsv_amount = parseFloat(body.purchase.cryptoAmount)
        }
      } else if (eventStatus === 'RETURNED') {
        updates.status = 'returned'
      }

      await db('purchases').where('id', row.id).update(updates)
    },

    toPurchase (row: any): Purchase {
      return {
        id: row.id,
        userId: row.user_id,
        rampPurchaseId: row.ramp_purchase_id,
        rampViewToken: row.ramp_view_token,
        targetAddress: row.target_address,
        fiatAmount: row.fiat_amount,
        fiatCurrency: row.fiat_currency,
        bsvAmount: row.bsv_amount,
        status: row.status,
        rampWebhookPayload: row.ramp_webhook_payload ? JSON.parse(row.ramp_webhook_payload) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    }
  }
}
