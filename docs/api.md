# API Reference

Base URL `http://localhost:4000`. Interactive Swagger UI: **http://localhost:4000/docs**
(raw document at `/openapi.json`).

All endpoints except `/api/auth/register` and `/api/auth/login` require:

```
Authorization: Bearer <jwt>
```

Errors return `{ "error": "message", "details": … }` with status 400 (validation),
401 (unauthenticated), 403 (wrong role), 404, 409 (illegal transition / duplicate)
or 500.

## Authentication

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | public | Register a customer. Body: `name, email, password, phone?` |
| POST | `/api/auth/login` | public | Returns `{ token, user }` |
| GET | `/api/auth/me` | any | Current user, including agent profile |

## Quotes

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| POST | `/api/quotes` | any | Price a shipment before booking |

Body: `serviceType, paymentType, lengthCm, breadthCm, heightCm, actualWeightKg,
declaredValue?, pickupPostalCode, dropPostalCode`.
Returns the weights, resolved zones, scope and a `lines[]` breakdown with the total.

## Orders

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| POST | `/api/orders` | CUSTOMER, ADMIN | Create an order (admin passes `customerId`) |
| GET | `/api/orders` | any | List, scoped by role. Admin query params: `status` (comma-separated), `zoneId`, `agentId`, `customerId`, `search` |
| GET | `/api/orders/:id` | owner / assigned agent / admin | Full order detail |
| GET | `/api/orders/:id/tracking` | owner / assigned agent / admin | Timeline, attempts, assignments |
| PATCH | `/api/orders/:id/status` | AGENT, ADMIN | Body: `status, note?, failureReason?, override?` |
| POST | `/api/orders/:id/reschedule` | CUSTOMER, ADMIN | Body: `scheduledDate, note?` |

Create body: the quote fields (minus postal codes) plus `pickup` and `drop`
objects (`contactName, contactPhone, line1, line2?, city, state, postalCode,
latitude?, longitude?`) and optional `notes`.

`FAILED` requires `failureReason`. `override: true` (admin only) bypasses the
transition rules and is labelled as an override in the history.

## Agents

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/api/agents` | ADMIN | Fleet list; filters `status`, `zoneId` |
| GET | `/api/agents/me` | AGENT | Own profile and active load |
| PATCH | `/api/agents/me/availability` | AGENT | Body: `status` = AVAILABLE / BUSY / OFFLINE |
| PATCH | `/api/agents/me/location` | AGENT | Body: `latitude, longitude, baseZoneId?` |
| GET | `/api/agents/me/orders` | AGENT | Orders currently assigned |
| PATCH | `/api/agents/:id` | ADMIN | Update status, coordinates, base zone, capacity |

## Assignments

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| POST | `/api/assignments/orders/:id/assign` | ADMIN | `{}` → automatic nearest agent; `{ agentId }` → manual |
| GET | `/api/assignments/orders/:id/assignments` | ADMIN | Assignment history |

Returns `selection: { agentId, method, distanceKm, reason }` so the UI can show
who was picked and why.

## Zones

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/api/zones` | any | Zones with their postal-code areas |
| POST | `/api/zones` | ADMIN | Body: `code, name, city, centerLat?, centerLng?` |
| PATCH | `/api/zones/:id` | ADMIN | Update a zone |
| POST | `/api/zones/:id/areas` | ADMIN | Body: `postalCode, areaName` |
| DELETE | `/api/zones/areas/:areaId` | ADMIN | Remove a postal-code mapping |

## Rate cards

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/api/rate-cards` | any | Cards with intra/inter rules |
| POST | `/api/rate-cards` | ADMIN | Create a card |
| PATCH | `/api/rate-cards/:id` | ADMIN | `volumetricDivisor, fuelSurchargePercent, taxPercent, isActive` |
| PUT | `/api/rate-cards/:id/rules` | ADMIN | Upsert a rule: `scope, baseCharge, includedWeightKg, perKgCharge, minCharge` |

## COD

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/api/cod` | any | COD surcharge configurations |
| POST | `/api/cod` | ADMIN | Create |
| PATCH | `/api/cod/:id` | ADMIN | `mode, flatAmount, percentOfValue, minAmount, isActive` |

## Admin

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/api/admin/stats` | ADMIN | Counters, revenue, recent orders |
| GET | `/api/admin/customers` | ADMIN | Customer list |
| GET | `/api/admin/notifications` | ADMIN | Notification event log |
| POST | `/api/admin/agents` | ADMIN | Create an agent account + profile |

## Example

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"ravi@customer.dev","password":"Password@123"}' | jq -r .token)

curl -s -X POST http://localhost:4000/api/quotes \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"serviceType":"B2C","paymentType":"COD","lengthCm":40,"breadthCm":30,
       "heightCm":25,"actualWeightKg":4,"declaredValue":4500,
       "pickupPostalCode":"560034","dropPostalCode":"560048"}' | jq
```
