# Phase 3: Onramp + Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Ramp Network on-ramp integration (fiat→BSV purchases) and service discovery catalog (tenants list services, users find them).

**Architecture:** Two independent modules. Onramp: stores purchase records, returns Ramp widget config, receives Ramp webhooks with ECDSA signature verification. Discovery: CRUD for service listings with public catalog search.

**Tech Stack:** Same as Phase 1-2. Ramp webhook verification uses `@bsv/sdk` for ECDSA.

---

## File Structure

```
src/modules/
├── onramp/
│   ├── types.ts
│   ├── service.ts
│   ├── routes.ts
│   └── __tests__/onramp.test.ts
└── discovery/
    ├── types.ts
    ├── service.ts
    ├── routes.ts
    └── __tests__/discovery.test.ts

src/db/migrations/
├── 008_create_purchases.ts
└── 009_create_service_listings.ts
```
