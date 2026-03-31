export interface User {
  id: string
  bsvIdentityKey: string
  email: string | null
  rampCustomerId: string | null
  status: 'active' | 'suspended'
  createdAt: string
  updatedAt: string
}
