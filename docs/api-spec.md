# ChannelMint API Specification

**Base URL**: `http://localhost:3000`

## Authentication

Two auth methods:

| Method | Header | Used By |
|--------|--------|---------|
| API Key | `Authorization: Bearer cm_...` | Tenants (businesses) |
| Identity Key | `x-bsv-identity-key: 02...` (66-char hex compressed pubkey) | Users (wallet holders) |

API keys have scopes: `billing:read`, `billing:write`, `analytics:read`, `analytics:write`, `discovery:read`, `discovery:write`

## Error Format

All errors return:
```json
{
  "status": "error",
  "code": "ERROR_CODE",
  "message": "Human-readable message"
}
```

| Code | HTTP Status |
|------|-------------|
| `VALIDATION_ERROR` | 400 |
| `AUTH_ERROR` | 401 |
| `NOT_FOUND` | 404 |
| `CONFLICT` | 409 |
| `INTERNAL_ERROR` | 500 |

---

## Health

### `GET /health`
**Auth**: None

**Response** `200`:
```json
{ "status": "ok" }
```

---

## Tenants

### `POST /v1/tenants`
Register a new business. Returns the tenant profile and first API key.

**Auth**: None

**Request**:
```json
{
  "name": "Acme AI",
  "email": "admin@acme.com",
  "bsvIdentityKey": "02ababababababababababababababababababababababababababababababababab"
}
```

**Response** `201`:
```json
{
  "tenant": {
    "id": "uuid",
    "name": "Acme AI",
    "email": "admin@acme.com",
    "bsvIdentityKey": "02ab...",
    "channelEndpointUrl": null,
    "webhookUrl": null,
    "webhookSecret": null,
    "status": "active",
    "createdAt": "2026-03-31T00:00:00.000Z",
    "updatedAt": "2026-03-31T00:00:00.000Z"
  },
  "apiKey": "cm_64char_hex_string..."
}
```

### `GET /v1/tenants/me`
Get own tenant profile.

**Auth**: API Key

**Response** `200`: `Tenant` object (same shape as above)

### `PATCH /v1/tenants/me`
Update tenant profile.

**Auth**: API Key

**Request** (all fields optional):
```json
{
  "name": "New Name",
  "webhookUrl": "https://acme.com/webhooks",
  "channelEndpointUrl": "https://api.acme.com/channels"
}
```

**Response** `200`: Updated `Tenant` object

### `POST /v1/tenants/me/api-keys`
Create an additional API key with specific scopes.

**Auth**: API Key

**Request**:
```json
{
  "label": "Read-only key",
  "scopes": ["billing:read", "analytics:read"],
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```

**Response** `201`:
```json
{
  "id": "uuid",
  "apiKey": "cm_...",
  "label": "Read-only key"
}
```

### `DELETE /v1/tenants/me/api-keys/:id`
Revoke an API key.

**Auth**: API Key

**Response** `200`:
```json
{ "status": "deleted" }
```

---

## Users

### `POST /v1/users`
Register a user (or return existing). Idempotent — calling twice with the same key returns the same user.

**Auth**: Identity Key header (user may not exist yet)

**Request**: None (identity from header)

**Response** `201` (new) / `200` (existing):
```json
{
  "id": "uuid",
  "bsvIdentityKey": "02ab...",
  "email": null,
  "rampCustomerId": null,
  "status": "active",
  "createdAt": "2026-03-31T00:00:00.000Z",
  "updatedAt": "2026-03-31T00:00:00.000Z"
}
```

### `GET /v1/users/me`
Get own user profile.

**Auth**: Identity Key (must be registered)

**Response** `200`: `User` object

---

## Billing

### Products

#### `POST /v1/billing/products`
Create a product (a billable SKU).

**Auth**: API Key + `billing:write`

**Request**:
```json
{
  "name": "API Call",
  "unitName": "call"
}
```

**Response** `201`:
```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "name": "API Call",
  "unitName": "call",
  "status": "active",
  "createdAt": "2026-03-31T00:00:00.000Z"
}
```

#### `GET /v1/billing/products`
List active products.

**Auth**: API Key + `billing:read`

**Response** `200`: `Product[]`

#### `PATCH /v1/billing/products/:id`
Update or archive a product.

**Auth**: API Key + `billing:write`

**Request**:
```json
{ "name": "Premium API Call", "status": "archived" }
```

**Response** `200`: Updated `Product`

### Rate Cards

#### `POST /v1/billing/rate-cards`
Create a rate card (centralized pricing container).

**Auth**: API Key + `billing:write`

**Request**:
```json
{
  "name": "Standard Pricing",
  "description": "Default rates for all customers"
}
```

**Response** `201`:
```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "name": "Standard Pricing",
  "description": "Default rates for all customers",
  "status": "active",
  "createdAt": "2026-03-31T00:00:00.000Z"
}
```

#### `GET /v1/billing/rate-cards`
List active rate cards.

**Auth**: API Key + `billing:read`

**Response** `200`: `RateCard[]`

### Rates

#### `POST /v1/billing/rate-cards/:id/rates`
Add a rate entry to a rate card. Append-only — new entries supersede old ones by `effectiveAt`.

**Auth**: API Key + `billing:write`

**Request**:
```json
{
  "productId": "uuid",
  "pricePerUnit": 100,
  "effectiveAt": "2026-01-01T00:00:00.000Z",
  "tierFloor": null,
  "dimensionKey": null,
  "dimensionValue": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `productId` | uuid | Which product this rate is for |
| `pricePerUnit` | integer | Price in satoshis |
| `effectiveAt` | ISO timestamp | When this rate takes effect |
| `tierFloor` | integer or null | For tiered pricing (e.g. 0, 1000, 10000) |
| `dimensionKey` | string or null | For dimensional pricing (e.g. "region") |
| `dimensionValue` | string or null | Dimension value (e.g. "us-east") |

**Response** `201`:
```json
{
  "id": "uuid",
  "rateCardId": "uuid",
  "productId": "uuid",
  "pricePerUnit": 100,
  "tierFloor": null,
  "dimensionKey": null,
  "dimensionValue": null,
  "effectiveAt": "2026-01-01T00:00:00.000Z",
  "createdAt": "2026-03-31T00:00:00.000Z"
}
```

#### `GET /v1/billing/rate-cards/:id/rates`
List rates for a rate card, ordered by effectiveAt descending.

**Auth**: API Key + `billing:read`

**Response** `200`: `Rate[]`

### Content Pricing

Maps content URL patterns to products, rate cards, and recipient splits.

#### `POST /v1/billing/content-pricing`
Create a content pricing rule.

**Auth**: API Key + `billing:write`

**Request**:
```json
{
  "rateCardId": "uuid",
  "contentPattern": "/api/v1/*",
  "productId": "uuid",
  "recipients": [
    { "name": "Platform", "identityKey": "02ab...", "percentage": 70 },
    { "name": "Creator", "identityKey": "03cd...", "percentage": 30 }
  ],
  "priority": 10
}
```

| Field | Type | Description |
|-------|------|-------------|
| `contentPattern` | string | Exact match or glob (`*` wildcard). E.g. `/api/v1/*` |
| `recipients` | array | Revenue split. Percentages must sum to 100 |
| `priority` | integer | Higher = checked first for overlapping patterns |

**Response** `201`:
```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "rateCardId": "uuid",
  "contentPattern": "/api/v1/*",
  "productId": "uuid",
  "recipients": [...],
  "priority": 10,
  "status": "active",
  "createdAt": "2026-03-31T00:00:00.000Z"
}
```

#### `GET /v1/billing/content-pricing`
List active content pricing rules, ordered by priority descending.

**Auth**: API Key + `billing:read`

**Response** `200`: `ContentPricing[]`

#### `PATCH /v1/billing/content-pricing/:id`
Update or archive a content pricing rule.

**Auth**: API Key + `billing:write`

**Request**:
```json
{ "status": "archived" }
```

**Response** `200`: Updated `ContentPricing`

### Config Resolution

**This is the endpoint that `RemoteChannelProvider` calls from tenant middleware.**

#### `GET /v1/billing/config/:contentId`
Resolve a content path to a `ChannelConfig`. The `:contentId` must be URL-encoded.

**Auth**: API Key + `billing:read`

**Response** `200`:
```json
{
  "chunkPrice": 100,
  "recipients": [
    { "name": "Platform", "identityKey": "02ab...", "percentage": 70 },
    { "name": "Creator", "identityKey": "03cd...", "percentage": 30 }
  ]
}
```

**Response** `404` if no pricing rule matches the content path.

---

## Onramp

### `POST /v1/onramp/session`
Create a purchase session. Returns Ramp Network widget configuration.

**Auth**: Identity Key

**Request**:
```json
{
  "receivingAddress": "1UsersBsvAddress...",
  "fiatCurrency": "USD"
}
```

**Response** `201`:
```json
{
  "purchase": {
    "id": "uuid",
    "userId": "uuid",
    "rampPurchaseId": null,
    "rampViewToken": null,
    "targetAddress": "1UsersBsvAddress...",
    "fiatAmount": null,
    "fiatCurrency": "USD",
    "bsvAmount": null,
    "status": "pending",
    "rampWebhookPayload": null,
    "createdAt": "2026-03-31T00:00:00.000Z",
    "updatedAt": "2026-03-31T00:00:00.000Z"
  },
  "widgetConfig": {
    "hostAppName": "ChannelMint",
    "enabledCryptoAssets": "BSV_BSV",
    "userAddress": "1UsersBsvAddress...",
    "inAsset": "USD",
    "defaultFlow": "ONRAMP",
    "purchaseId": "uuid"
  }
}
```

### `GET /v1/onramp/purchases`
List user's purchase history.

**Auth**: Identity Key

**Response** `200`: `Purchase[]`

### `GET /v1/onramp/purchases/:id`
Get a specific purchase.

**Auth**: Identity Key

**Response** `200`: `Purchase`

### `POST /v1/onramp/webhooks/ramp`
Ramp Network webhook receiver. Updates purchase status.

**Auth**: None (signature-verified in production)

**Request** (from Ramp):
```json
{
  "type": "RELEASED",
  "purchase": {
    "id": "uuid-or-ramp-id",
    "cryptoAmount": "0.5"
  }
}
```

**Response** `200`:
```json
{ "status": "ok" }
```

---

## Discovery

### Tenant Management (Auth Required)

#### `POST /v1/discovery/services`
Create a service listing.

**Auth**: API Key + `discovery:write`

**Request**:
```json
{
  "name": "Acme AI API",
  "description": "Pay-per-call AI inference",
  "category": "ai",
  "channelEndpointUrl": "https://api.acme.com/channels",
  "thumbnailUrl": "https://acme.com/logo.png",
  "tags": ["ai", "inference", "gpt"]
}
```

**Response** `201`:
```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "name": "Acme AI API",
  "description": "Pay-per-call AI inference",
  "category": "ai",
  "channelEndpointUrl": "https://api.acme.com/channels",
  "thumbnailUrl": "https://acme.com/logo.png",
  "tags": ["ai", "inference", "gpt"],
  "status": "active",
  "createdAt": "2026-03-31T00:00:00.000Z",
  "updatedAt": "2026-03-31T00:00:00.000Z"
}
```

#### `GET /v1/discovery/services/me`
List own service listings.

**Auth**: API Key

**Response** `200`: `ServiceListing[]`

#### `PATCH /v1/discovery/services/:id`
Update a service listing.

**Auth**: API Key + `discovery:write`

**Request** (all fields optional):
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "category": "ai",
  "channelEndpointUrl": "https://new-api.acme.com",
  "thumbnailUrl": "https://acme.com/new-logo.png",
  "tags": ["ai", "updated"],
  "status": "unlisted"
}
```

**Response** `200`: Updated `ServiceListing`

#### `DELETE /v1/discovery/services/:id`
Remove a service listing.

**Auth**: API Key + `discovery:write`

**Response** `200`:
```json
{ "status": "deleted" }
```

### Public Catalog (No Auth)

#### `GET /v1/discovery/catalog`
Browse all active service listings. Optional category filter.

**Auth**: None

**Query params**: `?category=ai` (optional)

**Response** `200`: `ServiceListing[]` (only active listings)

#### `GET /v1/discovery/catalog/search`
Search services by name, description, or tags.

**Auth**: None

**Query params**: `?q=search+term` (required)

**Response** `200`: `ServiceListing[]`

#### `GET /v1/discovery/catalog/:id`
Get a specific service listing.

**Auth**: None

**Response** `200`: `ServiceListing`

---

## Analytics

### Event Ingestion (From Tenant Middleware)

#### `POST /v1/analytics/events`
Ingest channel lifecycle events. Called by the `AnalyticsBuffer` in channel-express-middleware.

**Auth**: API Key + `analytics:write`

**Request**:
```json
{
  "events": [
    {
      "eventType": "channel.opened",
      "channelId": "txid:0",
      "consumerIdentityKey": "02abc...",
      "contentId": "/api/v1/generate",
      "payload": { "fundingSatoshis": 50000, "chunkPrice": 100 },
      "timestamp": 1711843200000
    },
    {
      "eventType": "channel.updated",
      "channelId": "txid:0",
      "consumerIdentityKey": "02abc...",
      "contentId": "/api/v1/generate",
      "payload": { "satoshisPaid": 100, "sequence": 1, "remainingBalance": 49900 },
      "timestamp": 1711843201000
    },
    {
      "eventType": "channel.closed",
      "channelId": "txid:0",
      "consumerIdentityKey": "02abc...",
      "contentId": "/api/v1/generate",
      "payload": { "settlementTxid": "abc123...", "totalSatoshisPaid": 5000 },
      "timestamp": 1711843300000
    }
  ]
}
```

| eventType | Description | Key payload fields |
|-----------|-------------|-------------------|
| `channel.opened` | New payment channel created | `fundingSatoshis`, `chunkPrice` |
| `channel.updated` | Payment committed | `satoshisPaid`, `sequence`, `remainingBalance` |
| `channel.closed` | Channel settled on-chain | `settlementTxid`, `totalSatoshisPaid` |
| `channel.failed` | Error occurred | `error` |

**Response** `200`:
```json
{ "ingested": 3 }
```

Events are deduplicated:
- `channel.opened`/`channel.closed`: by `channelId + eventType`
- `channel.updated`: by `channelId + eventType + payload.sequence`

#### `POST /v1/analytics/events/batch`
Same as `/events` — alias for batch ingestion.

### Tenant Queries

#### `GET /v1/analytics/revenue`
Revenue summary grouped by day.

**Auth**: API Key + `analytics:read`

**Query params**: `?periodStart=2026-03-01T00:00:00Z&periodEnd=2026-03-31T00:00:00Z` (optional)

**Response** `200`:
```json
[
  { "period": "2026-03-30T00:00:00.000Z", "totalSatoshis": 15000 },
  { "period": "2026-03-31T00:00:00.000Z", "totalSatoshis": 8500 }
]
```

#### `GET /v1/analytics/usage`
Usage stats grouped by day.

**Auth**: API Key + `analytics:read`

**Query params**: `?periodStart=...&periodEnd=...` (optional)

**Response** `200`:
```json
[
  { "period": "2026-03-30T00:00:00.000Z", "totalRequests": 150, "channelCount": 3 },
  { "period": "2026-03-31T00:00:00.000Z", "totalRequests": 85, "channelCount": 2 }
]
```

#### `GET /v1/analytics/users/:identityKey`
Per-user spending breakdown for a specific consumer.

**Auth**: API Key + `analytics:read`

**Response** `200`:
```json
[
  {
    "id": "uuid",
    "tenantId": "uuid",
    "consumerIdentityKey": "02abc...",
    "periodStart": "2026-03-30T00:00:00.000Z",
    "periodEnd": "2026-03-31T00:00:00.000Z",
    "totalSatoshisPaid": 5000,
    "totalRequests": 50,
    "channelCount": 1,
    "updatedAt": "2026-03-31T00:00:00.000Z"
  }
]
```

### User Queries

#### `GET /v1/analytics/me/spending`
User's spending across all tenants.

**Auth**: Identity Key

**Response** `200`: `UsageSummary[]` (same shape as above, may span multiple tenants)
