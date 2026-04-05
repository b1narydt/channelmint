import { v4 as uuid } from 'uuid'
import type { Knex } from 'knex'
import type { User } from './types.js'

export function createUserService (db: Knex) {
  return {
    async findOrCreate (bsvIdentityKey: string): Promise<{ user: User; created: boolean }> {
      const existing = await db('users').where('bsv_identity_key', bsvIdentityKey).first()
      if (existing) {
        return { user: this.toUser(existing), created: false }
      }

      const now = new Date().toISOString()
      const id = uuid()
      await db('users').insert({
        id,
        bsv_identity_key: bsvIdentityKey,
        status: 'active',
        created_at: now,
        updated_at: now
      })

      const row = await db('users').where('id', id).first()
      return { user: this.toUser(row), created: true }
    },

    async getByIdentityKey (bsvIdentityKey: string): Promise<User | null> {
      const row = await db('users').where('bsv_identity_key', bsvIdentityKey).first()
      if (!row) return null
      return this.toUser(row)
    },

    toUser (row: any): User {
      return {
        id: row.id,
        bsvIdentityKey: row.bsv_identity_key,
        email: row.email,
        rampCustomerId: row.ramp_customer_id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    }
  }
}
