# ChannelMint: Usage-Based Billing Platform Design

**Date**: 2026-03-30
**Status**: Draft (v2 — revised architecture)
**Product**: ChannelMint (working name)

## 1. Overview

ChannelMint is a hosted, multi-tenant, API-first usage-based billing platform. It competes with Metronome by replacing monthly invoice cycles with real-time BSV micropayment settlement.

**Core value proposition**: Businesses configure products and rate cards via the ChannelMint API. They install `channel-express-middleware` in their infrastructure with a `RemoteChannelProvider` that fetches pricing from ChannelMint. Users fund their own BRC-100 wallets via Ramp Network and pay businesses directly through payment channels. The platform provides pricing configuration, usage analytics, service discovery, and fiat on-ramp — but never sits in the payment path.

### Key Differentiators vs Metronome

| Dimension | Metronome | ChannelMint |
|-----------|-----------|-------------|
| Settlement | Monthly invoices via Stripe | Real-time BSV micropayments |
| Payment rail | Stripe (fiat) | BSV payment channels |
| Metering | Platform ingests events, rates later | Middleware meters per-request, settles instantly |
| Custody | N/A (invoicing) | Non-custodial (users hold own keys) |
| Settlement speed | 30-60 day invoice cycles | Instant (off-chain commitments) |
| Minimum charge | Practical minimum ~$0.50 | Sub-cent micropayments possible |
| On-ramp | Credit card via Stripe | Ramp Network (card, bank, Apple Pay) |
| Platform role | In the payment path | Beside the payment path |

### Architectural Insight

Channel-express-middleware IS already a billing engine:
- `ChannelProvider` = rate card (dynamic pricing per content/product)
- `handlePricing` (402) = pricing discovery (product catalog)
- `handleUpdate` = metering + rating + settlement in one step
- `req.payment` = proof of payment attached to the request
- `Recipients` with percentages = revenue split

Building another rating engine on top would be redundant and creates a timing mismatch — payment channels settle synchronously (pay → receive), while Metronome-style metering is asynchronous (receive → event → invoice → pay). The platform should configure the existing engine, not replace it.

### Architectural Approach

Modular monolith — single deployable Express application with strict module boundaries. Each module has its own routes, data models, and internal interface. Can be decomposed into microservices later along module boundaries.

**Platform sits beside the payment path, not in it:**

```
User Wallet ←→ Tenant's channel-express-middleware (direct payment + content)
     ↕                              ↕
  Platform                       Platform
  (on-ramp,                     (pricing config via RemoteChannelProvider,
   discovery)                    analytics via event hooks)
```

## 2. System Architecture

### Module Map

```
channelmint/
├── src/
│   ├── app.ts                     # Express app, mounts all route groups
│   ├── config/                    # Env, secrets, feature flags
│   ├── db/                        # Knex migrations, shared DB connection
│   │
│   ├── modules/
│   │   ├── auth/                  # API key auth (tenants), BRC-103 identity (users)
│   │   ├── tenants/               # Business accounts, endpoint registration
│   │   ├── users/                 # User accounts, wallet identity keys
│   │   ├── onramp/                # Ramp Network widget config + webhooks
│   │   ├── billing/               # Products, rate cards (CRUD for RemoteChannelProvider)
│   │   ├── analytics/             # Receives events FROM middleware, aggregates usage
│   │   └── discovery/             # Tenant/service registry for user wallet lookup
│   │
│   ├── shared/                    # Cross-cutting: errors, middleware, types, events
│   └── index.ts                   # Entry point
```

### Changes to channel-express-middleware

Minimal additions to the existing package (protocol unchanged):

| Change | What | Why |
|--------|------|-----|
| `RemoteChannelProvider` | New `ChannelProvider` implementation that fetches pricing from ChannelMint API | Tenants configure pricing in dashboard, middleware fetches at request time |
| Event hooks | `onChannelOpen`, `onChannelUpdate`, `onChannelClose` callback options on middleware | Platform receives usage data for analytics (fire-and-forget) |
| Tenant ID header | Middleware sends `x-channelmint-tenant-id` in analytics event reports | Multi-tenant attribution |

The payment channel protocol, funding, commitments, settlement, BEEF delivery — all unchanged.

### Data Flow Summary

1. **Business setup**: Tenant registers on ChannelMint → creates products + rate cards via API → installs channel-express-middleware with `RemoteChannelProvider` pointing at ChannelMint
2. **User top-up**: User opens Ramp widget (configured by ChannelMint) → purchases BSV with fiat → Ramp delivers BSV to user's BRC-100 wallet address
3. **Service discovery**: User's wallet queries ChannelMint discovery API → finds tenant services and endpoint URLs
4. **Usage + payment (direct)**: User's wallet opens channel against tenant's middleware endpoint → middleware fetches pricing from ChannelMint via `RemoteChannelProvider` → user pays per-request → middleware serves content → middleware fires analytics event to ChannelMint
5. **Settlement**: Channel closes → BSV settles on-chain to tenant's derived addresses → middleware reports close event to ChannelMint analytics

### Non-Custodial Model

The platform never holds user private keys, never signs transactions, and never proxies payments. Users' BRC-100 wallets interact directly with tenant middleware endpoints. The platform provides configuration, analytics, on-ramp, and discovery — all read/write operations on metadata, never on funds.

## 3. Module Specifications

### 3.1 Auth Module

**Purpose**: API key authentication for tenants, wallet-based identity authentication for users.

#### Data Model

```
ApiKey {
  id: uuid
  tenantId: uuid (FK → Tenant)
  keyHash: string (SHA-256 of full key)
  prefix: string (first 8 chars, for lookup)
  scopes: string[] (e.g. ["billing:write", "analytics:read"])
  label: string
  expiresAt: timestamp | null
  createdAt: timestamp
}
```

#### Authentication Methods

- **Tenants**: `Authorization: Bearer <api_key>` header. Key prefix used for fast lookup, then hash compared.
- **Users**: BRC-103 wallet identity — signed challenge/response. Same identity keys used by channel-express-middleware for channel derivation.
- **Middleware (RemoteChannelProvider)**: Tenant API key, used by the middleware to fetch pricing from ChannelMint.

#### Scopes

| Scope | Access |
|-------|--------|
| `billing:write` | Create/update products, rate cards |
| `billing:read` | Read billing configuration (used by RemoteChannelProvider) |
| `analytics:write` | Report channel events (used by middleware event hooks) |
| `analytics:read` | Query usage and revenue data |
| `discovery:write` | Register/update service listings |
| `discovery:read` | Browse service catalog |

#### Internal Interface

- `authenticate()` — Express middleware, attaches `req.tenant` or `req.user`
- `authorizeTenant(...scopes)` — scope-checking middleware
- `authorizeUser()` — user identity verification middleware

### 3.2 Tenants Module

**Purpose**: Business accounts that configure billing and receive BSV payments.

#### Data Model

```
Tenant {
  id: uuid
  name: string
  email: string
  bsvIdentityKey: string (66-char hex, compressed public key)
  channelEndpointUrl: string (their channel-express-middleware base URL)
  webhookUrl: string | null (for platform notifications)
  webhookSecret: string | null
  status: "active" | "suspended"
  createdAt: timestamp
  updatedAt: timestamp
}
```

#### API Routes (`/v1/tenants`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/` | None (registration) | Register new tenant, returns first API key |
| GET | `/me` | Tenant | Get own tenant profile |
| PATCH | `/me` | Tenant | Update profile, webhook URL, channel endpoint |
| POST | `/me/api-keys` | Tenant | Create additional API key |
| DELETE | `/me/api-keys/:id` | Tenant | Revoke API key |

#### Key Detail

`channelEndpointUrl` is the base URL of the tenant's channel-express-middleware instance. Registered in the discovery module so user wallets can find it.

### 3.3 Users Module

**Purpose**: End-user accounts identified by their BRC-100 wallet identity keys.

#### Data Model

```
User {
  id: uuid
  bsvIdentityKey: string (66-char hex, primary identifier)
  email: string | null
  rampCustomerId: string | null
  status: "active" | "suspended"
  createdAt: timestamp
  updatedAt: timestamp
}
```

#### API Routes (`/v1/users`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/` | BRC-103 | Register (or auto-register on first auth) |
| GET | `/me` | User | Get profile |
| GET | `/me/spending` | User | Spending history across tenants (from analytics) |

#### Key Detail

Users are identified by their `bsvIdentityKey` — the same key their BRC-100 wallet uses for channel-express-middleware channel derivation. No passwords, no email-based auth. The wallet IS the identity.

### 3.4 Onramp Module

**Purpose**: Thin integration layer around Ramp Network for fiat-to-BSV purchases.

#### Data Model

```
Purchase {
  id: uuid
  userId: uuid (FK → User)
  rampPurchaseId: string
  rampViewToken: string
  targetAddress: string (BSV address from user's wallet)
  fiatAmount: number
  fiatCurrency: string (e.g. "USD", "EUR")
  bsvAmount: number | null (filled on RELEASED)
  status: "pending" | "released" | "returned" | "expired"
  rampWebhookPayload: json | null
  createdAt: timestamp
  updatedAt: timestamp
}
```

#### API Routes (`/v1/onramp`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/session` | User | Returns Ramp widget config with user's wallet address |
| GET | `/purchases` | User | Purchase history |
| GET | `/purchases/:id` | User | Purchase status |
| POST | `/webhooks/ramp` | Ramp signature | Ramp webhook receiver |

#### Ramp Widget Configuration

`POST /session` request body:
```json
{
  "receivingAddress": "1UsersBsvAddress...",
  "fiatCurrency": "USD"
}
```

Response (client uses this to initialize Ramp widget):
```json
{
  "hostApiKey": "ramp_key_...",
  "hostAppName": "ChannelMint",
  "hostLogoUrl": "https://channelmint.com/logo.png",
  "enabledCryptoAssets": "BSV_BSV",
  "userAddress": "1UsersBsvAddress...",
  "inAsset": "USD",
  "defaultFlow": "ONRAMP",
  "webhookStatusUrl": "https://api.channelmint.com/v1/onramp/webhooks/ramp?userId=<userId>&purchaseId=<purchaseId>"
}
```

#### Webhook Flow

1. Ramp POSTs to `/webhooks/ramp` with purchase status update
2. Verify ECDSA signature in `X-Body-Signature` header against Ramp's public key
3. Look up `Purchase` by `rampPurchaseId`
4. On `RELEASED`: update status, record `bsvAmount`
5. On `RETURNED`: update status to `returned`

#### Key Details

- The user's wallet provides its own receiving address — the platform does not derive or control it
- Ramp handles all KYC inside the widget
- BSV network fees are negligible (~0.01 EUR)
- Ramp fees: 2.5-5.5% depending on payment method
- No programmatic purchase API exists — purchases must go through the Ramp widget

### 3.5 Billing Module

**Purpose**: CRUD API for products and rate cards. Consumed by `RemoteChannelProvider` in tenant middleware instances.

This is deliberately simpler than Metronome's billing module — no billable metrics, no aggregation engine. The middleware handles metering per-request. The billing module is a pricing configuration store.

#### Data Models

```
Product {
  id: uuid
  tenantId: uuid (FK → Tenant)
  name: string
  unitName: string (e.g. "API call", "token", "MB")
  status: "active" | "archived"
  createdAt: timestamp
}

RateCard {
  id: uuid
  tenantId: uuid (FK → Tenant)
  name: string
  description: string | null
  status: "active" | "archived"
  createdAt: timestamp
}

Rate {
  id: uuid
  rateCardId: uuid (FK → RateCard)
  productId: uuid (FK → Product)
  pricePerUnit: number (satoshis)
  tierFloor: number | null (null = flat pricing; 0, 1000, 10000 for tiered)
  dimensionKey: string | null (null = flat; e.g. "region" for dimensional)
  dimensionValue: string | null (null = flat; e.g. "us-east")
  effectiveAt: timestamp (enables scheduled price changes)
  createdAt: timestamp
}

ContentPricing {
  id: uuid
  tenantId: uuid (FK → Tenant)
  rateCardId: uuid (FK → RateCard)
  contentPattern: string (glob or exact match, e.g. "/api/v1/*" or "/premium/content/123")
  productId: uuid (FK → Product)
  recipients: json (RecipientConfig[])
  priority: number (higher = checked first, for overlapping patterns)
  status: "active" | "archived"
  createdAt: timestamp
}
```

#### API Routes (`/v1/billing`)

**Products**:

| Method | Path | Auth | Scope | Description |
|--------|------|------|-------|-------------|
| POST | `/products` | Tenant | billing:write | Create product |
| GET | `/products` | Tenant | billing:read | List products |
| PATCH | `/products/:id` | Tenant | billing:write | Update/archive product |

**Rate Cards**:

| Method | Path | Auth | Scope | Description |
|--------|------|------|-------|-------------|
| POST | `/rate-cards` | Tenant | billing:write | Create rate card |
| GET | `/rate-cards` | Tenant | billing:read | List rate cards |
| POST | `/rate-cards/:id/rates` | Tenant | billing:write | Add rate entry (append-only) |
| GET | `/rate-cards/:id/rates` | Tenant | billing:read | List rates (effective-at filtering) |

**Content Pricing** (maps content paths to products + rates + recipients):

| Method | Path | Auth | Scope | Description |
|--------|------|------|-------|-------------|
| POST | `/content-pricing` | Tenant | billing:write | Create content pricing rule |
| GET | `/content-pricing` | Tenant | billing:read | List pricing rules |
| PATCH | `/content-pricing/:id` | Tenant | billing:write | Update/archive rule |

**RemoteChannelProvider endpoint** (called by tenant's middleware):

| Method | Path | Auth | Scope | Description |
|--------|------|------|-------|-------------|
| GET | `/config/:contentId` | Tenant (API key) | billing:read | Returns `ChannelConfig` for the given contentId |

The `/config/:contentId` endpoint is the key integration point. When a user's request hits the tenant's middleware, the `RemoteChannelProvider` calls this endpoint to resolve the `ChannelConfig` (chunkPrice, recipients, multisig settings). The middleware then uses this to generate the 402 response or validate a payment.

**Response format** (matches `ChannelConfig` interface exactly):
```json
{
  "chunkPrice": 100,
  "recipients": [
    { "name": "Platform", "identityKey": "02abc...", "percentage": 70 },
    { "name": "Creator", "identityKey": "02def...", "percentage": 30 }
  ],
  "multisig": { "required": 2, "total": 2 }
}
```

#### Key Design Decisions

- **Rates are append-only**: New rate entries supersede old ones by `effectiveAt` timestamp. No mutation, full audit trail.
- **Tiered pricing**: Multiple `Rate` rows with different `tierFloor` values.
- **Dimensional pricing**: Multiple `Rate` rows with different `dimensionKey`/`dimensionValue`.
- **Prices in satoshis**: All pricing denominated in satoshis since channels settle in BSV.
- **ContentPricing**: Maps content paths (glob patterns) to products, rate cards, and recipient splits. This is how the `RemoteChannelProvider` resolves a `contentId` to a `ChannelConfig`.
- **Caching**: The RemoteChannelProvider should cache responses with a short TTL (e.g. 60s) to avoid hitting the platform API on every request. Cache invalidation via TTL expiry — pricing changes take effect within the cache window.

### 3.6 Analytics Module

**Purpose**: Receives channel lifecycle events FROM tenant middleware instances. Aggregates into usage dashboards, revenue reports, and per-user spending history. Read-only with respect to payments — does not drive any payment logic.

#### Data Models

```
ChannelEvent {
  id: uuid
  tenantId: uuid (FK → Tenant)
  eventType: "channel.opened" | "channel.updated" | "channel.closed" | "channel.failed"
  channelId: string
  consumerIdentityKey: string
  contentId: string
  payload: json (event-specific data)
  timestamp: timestamp
  createdAt: timestamp
}

UsageSummary {
  id: uuid
  tenantId: uuid (FK → Tenant)
  consumerIdentityKey: string
  productId: uuid | null (FK → Product, resolved from contentId)
  periodStart: timestamp
  periodEnd: timestamp
  totalSatoshisPaid: number
  totalRequests: number
  channelCount: number
  updatedAt: timestamp
}
```

#### API Routes (`/v1/analytics`)

**Event ingestion** (called by tenant middleware event hooks):

| Method | Path | Auth | Scope | Description |
|--------|------|------|-------|-------------|
| POST | `/events` | Tenant | analytics:write | Report channel event(s) |
| POST | `/events/batch` | Tenant | analytics:write | Batch report (up to 1000) |

**Queries** (for tenants):

| Method | Path | Auth | Scope | Description |
|--------|------|------|-------|-------------|
| GET | `/revenue` | Tenant | analytics:read | Revenue summary by period, product, or user |
| GET | `/usage` | Tenant | analytics:read | Request counts, channel counts by period |
| GET | `/users/:identityKey` | Tenant | analytics:read | Per-user spending breakdown |

**Queries** (for users):

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/me/spending` | User | Spending across all tenants |
| GET | `/me/spending/:tenantId` | User | Spending with a specific tenant |

#### Event Payload Examples

**channel.opened**:
```json
{
  "channelId": "txid:0",
  "consumerIdentityKey": "02abc...",
  "contentId": "/api/v1/generate",
  "fundingSatoshis": 100000,
  "chunkPrice": 100
}
```

**channel.updated**:
```json
{
  "channelId": "txid:0",
  "consumerIdentityKey": "02abc...",
  "contentId": "/api/v1/generate",
  "satoshisPaid": 100,
  "sequence": 5,
  "remainingBalance": 99500
}
```

**channel.closed**:
```json
{
  "channelId": "txid:0",
  "consumerIdentityKey": "02abc...",
  "contentId": "/api/v1/generate",
  "settlementTxid": "abc123...",
  "totalSatoshisPaid": 5000,
  "totalRequests": 50
}
```

#### Key Design Decisions

- **Fire-and-forget**: Middleware event hooks are non-blocking. If the platform is unreachable, payments still work. Events can be retried or lost without affecting billing.
- **Pre-computed summaries**: `UsageSummary` rows updated on event ingestion for fast dashboard queries.
- **Period granularity**: Hourly and daily rollups. Configurable retention.
- **Idempotency**: Events deduplicated by `channelId + eventType + sequence` (for updates) or `channelId + eventType` (for open/close).
- **No payment logic**: Analytics is purely observational. It never triggers payments, dispatches instructions, or modifies channel state.

### 3.7 Discovery Module

**Purpose**: A registry where tenants list their services and channel endpoints. User wallets query this to find available services and pricing.

#### Data Models

```
ServiceListing {
  id: uuid
  tenantId: uuid (FK → Tenant)
  name: string (e.g. "Acme AI API")
  description: string
  category: string (e.g. "ai", "content", "gaming", "iot")
  channelEndpointUrl: string (base URL for channel-express-middleware)
  thumbnailUrl: string | null
  tags: string[]
  status: "active" | "unlisted" | "suspended"
  createdAt: timestamp
  updatedAt: timestamp
}
```

#### API Routes (`/v1/discovery`)

**Tenant management**:

| Method | Path | Auth | Scope | Description |
|--------|------|------|-------|-------------|
| POST | `/services` | Tenant | discovery:write | Create service listing |
| GET | `/services/me` | Tenant | discovery:write | List own service listings |
| PATCH | `/services/:id` | Tenant | discovery:write | Update listing |
| DELETE | `/services/:id` | Tenant | discovery:write | Remove listing |

**Public catalog** (for user wallets):

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/catalog` | None (public) | Browse all active service listings |
| GET | `/catalog/search` | None (public) | Search by name, category, tags |
| GET | `/catalog/:id` | None (public) | Get service details + endpoint URL |

#### Key Design Decisions

- **Public catalog**: No auth required to browse — user wallets need frictionless discovery.
- **Endpoint URL is the key output**: A user wallet gets a `channelEndpointUrl` from discovery, then connects directly to the tenant's middleware. The platform is not involved in the payment.
- **Tenant-managed**: Tenants control their own listings. Platform can suspend for abuse.

## 4. Changes to channel-express-middleware

### 4.1 RemoteChannelProvider

New file: `src/providers/RemoteChannelProvider.ts`

```typescript
export interface RemoteChannelProviderOptions {
  apiKey: string
  baseUrl: string           // ChannelMint API base URL
  cacheTtlMs?: number       // Default: 60000 (60s)
  timeoutMs?: number        // Default: 5000
  fallback?: ChannelConfig  // Returned if platform unreachable
}

export class RemoteChannelProvider implements ChannelProvider {
  async getChannelConfig(contentId: string): Promise<ChannelConfig>
}
```

**Behavior**:
1. On `getChannelConfig(contentId)`, check in-memory cache
2. If cached and TTL not expired, return cached config
3. Otherwise, fetch `GET {baseUrl}/v1/billing/config/{contentId}` with `Authorization: Bearer {apiKey}`
4. Parse response into `ChannelConfig`, cache it, return
5. If fetch fails and `fallback` is configured, return fallback
6. If fetch fails and no fallback, throw (middleware returns 500)

### 4.2 Event Hooks

New options on `createChannelMiddleware()`:

```typescript
export interface ChannelMiddlewareOptions {
  // ... existing options ...

  /** Analytics event hooks — fire-and-forget, non-blocking */
  analytics?: {
    /** URL to POST channel events to */
    endpointUrl: string
    /** API key for authentication */
    apiKey: string
    /** Tenant ID for attribution */
    tenantId: string
    /** Batch events and flush every N ms (default: 5000) */
    flushIntervalMs?: number
    /** Max events to buffer before forced flush (default: 100) */
    maxBufferSize?: number
  }
}
```

**Implementation**: A lightweight event buffer in the middleware that:
1. After `handleOpen` completes: enqueue `channel.opened` event
2. After `handleUpdate` calls `next()`: enqueue `channel.updated` event
3. After `handleClose` completes: enqueue `channel.closed` event
4. On error: enqueue `channel.failed` event
5. Flush buffer to `analytics.endpointUrl` every `flushIntervalMs` or when `maxBufferSize` reached
6. Fire-and-forget — flush failures are logged, not thrown

### 4.3 Tenant Integration Example

```typescript
import { createChannelMiddleware } from 'channel-express-middleware'
import { RemoteChannelProvider } from 'channel-express-middleware/providers'

const channelMiddleware = createChannelMiddleware({
  wallet: myWallet,
  channelProvider: new RemoteChannelProvider({
    apiKey: process.env.CHANNELMINT_API_KEY,
    baseUrl: 'https://api.channelmint.com',
    cacheTtlMs: 60000
  }),
  analytics: {
    endpointUrl: 'https://api.channelmint.com/v1/analytics/events',
    apiKey: process.env.CHANNELMINT_API_KEY,
    tenantId: process.env.CHANNELMINT_TENANT_ID
  },
  // ... other existing options (broadcaster, chainTracker, etc.)
})

app.use('/api', authMiddleware, channelMiddleware, (req, res) => {
  // req.payment.satoshisPaid is set by middleware
  res.json({ data: generateContent(req) })
})
```

## 5. Shared Infrastructure

### Database

Single PostgreSQL database. Each module owns its tables (prefixed by module name). Knex for migrations and queries — consistent with channel-express-middleware's existing `KnexChannelStore` pattern.

### Error Handling

Shared error classes:
- `AppError` (base) with `statusCode`, `code`, `message`
- `NotFoundError`, `ValidationError`, `AuthError`, `ConflictError`
- Express error middleware maps these to JSON responses

### Rate Limiting

Per-tenant rate limits on analytics ingestion and billing config endpoints. Configurable per API key scope.

## 6. Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Node.js + TypeScript | Matches channel-express-middleware |
| Framework | Express | Matches channel-express-middleware |
| Database | PostgreSQL via Knex | Production-ready, matches existing KnexChannelStore |
| Auth | BRC-103 + API keys | Native BSV identity, simple for tenants |
| On-ramp | Ramp Network SDK | Confirmed BSV support, handles KYC |
| Payment channels | channel-express-middleware | Core engine (tenant-side dependency) |
| Testing | Jest | Matches channel-express-middleware |

## 7. Subsystem Build Order

Given module dependencies, the recommended implementation order is:

**Phase 1 — Foundation + middleware changes**:
1. `shared/` + `db/` + `config/` — foundation
2. `auth/` — needed by everything
3. `RemoteChannelProvider` + event hooks in channel-express-middleware

**Phase 2 — Core platform**:
4. `tenants/` — businesses register
5. `users/` — users register
6. `billing/` — pricing configuration + `/config/:contentId` endpoint

**Phase 3 — User experience**:
7. `onramp/` — Ramp Network integration
8. `discovery/` — service catalog

**Phase 4 — Observability**:
9. `analytics/` — usage dashboards and revenue reporting

Each module is independently testable. Analytics comes last because it's purely observational — the system works without it.

## 8. Scalability Profile

| Dimension | Assessment |
|-----------|-----------|
| Payment throughput | Not limited by platform — direct between user wallet and tenant middleware |
| Platform load | Proportional to analytics events (batchable, lossy-tolerant) + billing config reads (cacheable) |
| Billing config | Cached by RemoteChannelProvider (60s TTL) — platform handles ~1 read per tenant per minute per content pattern, not per user request |
| Analytics ingestion | Buffered and batched by middleware — 1 batch per flush interval, not 1 call per request |
| Single point of failure | Platform down = middleware uses cached config + analytics events buffered. Payments continue. |

## 9. Out of Scope (v1)

- Dashboards / UI (API-first only)
- Off-ramp (BSV → fiat)
- Multi-currency pricing (satoshis only)
- Credit/commit ledgers (Metronome-style prepaid commits)
- Invoice generation (channels replace invoices)
- Stripe Connect payouts to tenants
- Multi-region deployment
- SQL billable metrics (middleware handles metering per-request)
