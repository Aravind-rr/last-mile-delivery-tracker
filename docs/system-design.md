# System Design

## 1. Purpose

A last-mile delivery tracker for a three-sided logistics network: customers book
shipments, delivery agents execute them in the field, and administrators
configure the pricing network and dispatch the fleet.

## 2. Architecture

A conventional three-tier system, chosen so every part is inspectable in a demo:

```
React SPA (Vite, TS, Tailwind)   →   Express REST API (TS)   →   PostgreSQL (Prisma)
   role-aware routing                 JWT auth + RBAC             single source of truth
                                      pricing / assignment
                                      notification adapter
```

The SPA holds a JWT in `localStorage` and attaches it to every call. The API is
stateless, so it scales horizontally behind a load balancer. All business rules
live in the API's service layer (`pricing`, `assignment`, `orders`,
`notifications`), never in routes or the UI — the same functions are used by the
HTTP layer, the seed script and the unit tests.

## 3. Domain model

`User` carries the role (ADMIN / CUSTOMER / AGENT); an agent additionally owns an
`AgentProfile` with availability, vehicle, base zone and live coordinates.
Geography is modelled as `Zone` plus `ZoneArea`, a unique postal-code → zone
mapping; this mapping alone decides whether a lane is intra- or inter-zone.

Pricing configuration is three tables: `RateCard` (per service type: volumetric
divisor, fuel surcharge %, tax %), `RateRule` (per card × zone scope: base
charge, included kg, per-kg charge, minimum) and `CodSurcharge` (per service
type: flat, percentage of declared value, or the higher of both).

An `Order` stores the addresses (`OrderAddress`), the resolved zones, the
computed weights and a frozen `priceBreakdown` JSON, so a later rate change never
rewrites history. Execution is tracked by `DeliveryAttempt` (one per delivery
try), `AgentAssignment` (who, how, how far, active or released) and
`OrderStatusHistory`.

## 4. Pricing engine

`volumetric = L × B × H ÷ divisor` and `billable = max(actual, volumetric)`. The
billable weight is rounded up into whole-kilogram slabs beyond the included
weight. The engine then reads the rate rule for the correct service type and zone
scope, adds the fuel surcharge, adds the COD surcharge when the payment type is
COD, applies tax and returns a line-by-line breakdown. `computePrice` is a pure
function of its configuration argument, which makes it exhaustively testable and
guarantees no rate is hardcoded — changing a row in `RateRule` changes the next
quote. The customer sees this exact breakdown before confirming.

## 5. Order lifecycle

```
PENDING_ASSIGNMENT → ASSIGNED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
                                     ↘ FAILED → RESCHEDULED → ASSIGNED → …
```

A single `changeStatus` function owns every transition. It validates the move
against an explicit adjacency map, enforces role permissions (agents may only set
field statuses on their own orders; customers may not set status at all; admins
may override with the override flag), updates the current attempt, and writes an
`OrderStatusHistory` row. History rows are append-only — no endpoint updates or
deletes them, so the tracking trail is immutable by construction.

## 6. Agent assignment

Deterministic and explainable. Candidates are agents who are AVAILABLE and below
their active-order capacity. If both the pickup address and the agents have
coordinates, the nearest agent by haversine distance wins; otherwise the
algorithm falls back to agents based in the pickup zone, then to the least-loaded
agent. Ties break on active load, then agent id, so the result is stable. Manual
assignment lets an admin name the agent directly. Either way the chosen agent,
the method and the distance are persisted and displayed.

## 7. Failed delivery and rescheduling

Marking a delivery failed requires a reason. The system closes the current
attempt as FAILED, releases the agent (their active assignment is deactivated,
not deleted), notifies the customer and moves the order to FAILED. The customer
picks a future date; a **new** `DeliveryAttempt` row is created and the order
moves to RESCHEDULED, which is assignable again. Previous attempts, assignments
and history all survive intact.

## 8. Notifications

Every status change raises an event through a pluggable adapter interface. The
demo ships a console/logging adapter; SMTP or an SMS gateway drops in by
implementing the same interface. Rows are persisted before delivery is attempted
and marked SENT or FAILED afterwards, and failures are swallowed — an unavailable
provider can never block an order.

## 9. Security and trade-offs

Passwords are bcrypt-hashed, JWTs are signed with a configurable secret, and
every route is guarded by `authenticate` plus `requireRole`; list endpoints
additionally scope rows to the caller. For demo speed the system uses synchronous
in-process notifications rather than a queue, `prisma db push` rather than
migration files, and postal-code lookup rather than a geocoding service. Each of
those is a swap at one seam, not a rewrite.
