# Database Schema

PostgreSQL via Prisma. Source of truth:
[`server/prisma/schema.prisma`](../server/prisma/schema.prisma).

## Entity overview

| Model | Purpose | Key relations |
| --- | --- | --- |
| `User` | Every account; `role` is ADMIN / CUSTOMER / AGENT | 1–1 `AgentProfile`, 1–n `Order` |
| `AgentProfile` | Fleet member: availability, vehicle, capacity, live coordinates | n–1 `Zone` (base), 1–n `AgentAssignment` |
| `Zone` | Operational zone (e.g. BLR-S) with an optional centre point | 1–n `ZoneArea`, `Order` |
| `ZoneArea` | Postal code → zone mapping; `postalCode` is **unique** | n–1 `Zone` |
| `RateCard` | Per service type: volumetric divisor, fuel %, tax %, active flag | 1–n `RateRule` |
| `RateRule` | Per card × zone scope: base, included kg, per-kg, minimum | unique `(rateCardId, scope)` |
| `CodSurcharge` | Per service type: mode, flat, percent, minimum | — |
| `Order` | The shipment: dimensions, weights, zones, frozen price breakdown | n–1 customer, zones, rate card |
| `OrderAddress` | Pickup and drop details + coordinates | unique `(orderId, kind)` |
| `DeliveryAttempt` | One row per delivery try; failures keep their reason | unique `(orderId, attemptNumber)` |
| `AgentAssignment` | Who was assigned, by which method, how far, active or released | n–1 `Order`, `AgentProfile` |
| `OrderStatusHistory` | **Append-only** tracking trail | n–1 `Order`, optional `DeliveryAttempt` |
| `Notification` | Email/SMS event log with delivery status | n–1 `Order`, `User` |

## Relationships

```
User 1─1 AgentProfile ──n AgentAssignment n── Order
 │                       └─n DeliveryAttempt n─┘
 └─n Order (as customer)
Zone 1─n ZoneArea            Order 1─2 OrderAddress
Zone 1─n Order (pickup/drop) Order 1─n OrderStatusHistory   (append-only)
RateCard 1─n RateRule        Order 1─n Notification
```

## Enums

`Role`, `AgentStatus` (AVAILABLE / BUSY / OFFLINE), `ServiceType` (B2B / B2C),
`PaymentType` (PREPAID / COD), `ZoneScope` (INTRA_ZONE / INTER_ZONE),
`OrderStatus` (PENDING_ASSIGNMENT → ASSIGNED → PICKED_UP → IN_TRANSIT →
OUT_FOR_DELIVERY → DELIVERED, plus FAILED / RESCHEDULED / CANCELLED),
`AddressKind`, `AttemptStatus`, `AssignmentMethod` (MANUAL /
AUTO_NEAREST_COORDINATES / AUTO_PICKUP_ZONE), `CodMode`, `NotificationChannel`,
`NotificationStatus`.

## Constraints and integrity

- `User.email`, `Zone.code` and `ZoneArea.postalCode` are unique — a postal code
  can belong to exactly one zone, which makes zone resolution deterministic.
- `RateRule` is unique on `(rateCardId, scope)`; the admin endpoint upserts it.
- `OrderAddress` is unique on `(orderId, kind)`; `DeliveryAttempt` on
  `(orderId, attemptNumber)`.
- Child rows (`OrderAddress`, `DeliveryAttempt`, `AgentAssignment`,
  `OrderStatusHistory`, `Notification`, `ZoneArea`) cascade on delete of their
  parent; `Order → Zone`, `Order → RateCard` and `AgentAssignment → AgentProfile`
  restrict, so configuration in use cannot be deleted out from under an order.
- Indexes on `Order.status`, `Order.customerId`, `Order.currentAgentId`,
  `AgentProfile.status` and `OrderStatusHistory(orderId, createdAt)` back the
  dashboard filters and the timeline query.
- Assignments are **released**, never deleted: `isActive` flips to false and
  `releasedAt` is stamped, preserving the dispatch record.

## Immutability

`OrderStatusHistory` rows are only ever created. No route or service performs an
update or delete on that table, so the tracking timeline is a true audit log. The
same principle applies to `DeliveryAttempt`: a reschedule adds attempt *n+1*
rather than resetting attempt *n*.

## Regenerating

```bash
cd server
npx prisma db push     # apply schema to the database
npm run seed           # wipe and reload demo data
npx prisma studio      # browse the data
```
