# ShipTrack — Last-Mile Delivery Tracker

A complete last-mile logistics application: customers book and track shipments,
delivery agents execute them in the field, and admins configure zones, rate cards
and COD charges while dispatching the fleet.

Zone-based pricing with volumetric weight, B2B/B2C rate cards, COD surcharges,
nearest-available-agent assignment, an immutable tracking trail, failed-delivery
handling and rescheduling — all driven by database configuration, with no
hardcoded prices.

---

## Features

### Customer
- Register / login
- Create a delivery order with pickup and drop addresses
- Enter package dimensions and actual weight
- Choose B2B or B2C, Prepaid or COD
- **See the full price breakdown before confirming** (volumetric vs actual weight, base, per-kg, fuel, COD, tax)
- View all orders with live status
- Tracking timeline with every status change, actor and note
- Reschedule a failed delivery to a future date

### Delivery agent
- Login
- Set availability: Available / Busy / Offline
- Set and update current coordinates (manual entry or device GPS)
- View assigned orders
- Advance status: Picked Up → In Transit → Out for Delivery → Delivered
- Mark a delivery Failed with a required reason

### Admin
- Operations dashboard (orders by status, fleet availability, booked revenue)
- All orders with filters by status, zone, agent and free-text search
- Book orders on behalf of a customer
- Manage zones and postal-code → area mappings
- Configure B2B/B2C intra-zone and inter-zone rate cards (base, included weight, per-kg, minimum, fuel %, tax %, volumetric divisor)
- Configure COD surcharges (flat, percentage of declared value, or higher of both)
- Assign agents manually, or auto-assign the nearest available agent
- Override any order status (recorded as an override in the history)
- Create agent accounts; view the notification event log

### Platform
- JWT authentication with role-based access control on every route
- Append-only `OrderStatusHistory` — the tracking trail can never be rewritten
- Delivery attempts preserved across reschedules
- Pluggable email/SMS notification adapter that never blocks an order
- Swagger/OpenAPI documentation at `/docs`

---

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 6, TypeScript, Tailwind CSS, React Router, Axios |
| Backend | Node.js, Express 4, TypeScript, Zod validation |
| Database | PostgreSQL 16 + Prisma ORM |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Docs | swagger-ui-express (OpenAPI 3) |
| Tests | Vitest + Supertest |

---

## Architecture

```
web/  React SPA          →   server/  Express REST API      →   PostgreSQL
  role-aware routing           JWT auth + RBAC middleware        via Prisma
  reusable components          services/pricing.ts
  Vite dev proxy → :4000       services/assignment.ts
                               services/orders.ts  (lifecycle + history)
                               services/notifications.ts (adapter)
```

All business rules live in `server/src/services/`, so the HTTP routes, the seed
script and the unit tests all exercise the same code. See
[docs/system-design.md](docs/system-design.md).

```
last-mile-delivery-tracker/
├── server/
│   ├── prisma/schema.prisma      # 13 models
│   ├── prisma/seed.ts            # demo data
│   ├── src/routes/               # auth, orders, agents, assignments, config, admin
│   ├── src/services/             # pricing, assignment, orders, notifications
│   ├── src/middleware/           # auth + RBAC, error handling
│   └── tests/                    # 51 tests
├── web/src/
│   ├── pages/{customer,agent,admin}/
│   ├── components/               # Layout, OrderTable, Timeline, PriceBreakdown, ui
│   └── context/AuthContext.tsx
└── docs/
```

---

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ running locally

```bash
git clone https://github.com/trilochan06/last-mile-delivery-tracker.git
cd last-mile-delivery-tracker
```

### 1. Database

```bash
createdb lmdt
```

macOS with Homebrew, if you do not have PostgreSQL yet:

```bash
brew install postgresql@16 && brew services start postgresql@16 && createdb lmdt
```

### 2. Backend

```bash
cd server
npm install
cp ../.env.example .env          # then edit DATABASE_URL and JWT_SECRET
npx prisma generate
npx prisma db push
npm run seed
npm run dev                      # http://localhost:4000
```

### 3. Frontend

```bash
cd web
npm install
npm run dev                      # http://localhost:5173
```

Open **http://localhost:5173** and sign in with a demo account below.

---

## Environment variables

`server/.env` (template in [`.env.example`](.env.example)):

| Variable | Purpose | Example |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/lmdt?schema=public` |
| `JWT_SECRET` | Signing secret for access tokens | a long random string |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `PORT` | API port | `4000` |
| `CORS_ORIGIN` | Allowed frontend origin(s), comma-separated | `http://localhost:5173` |
| `NOTIFICATION_DRIVER` | Notification adapter | `console` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Email provider (optional) | — |
| `SMS_PROVIDER_KEY` | SMS provider key (optional) | — |

Without provider credentials the notification service logs events and records
them in the `Notification` table; delivery failures never block an order.

---

## Database setup

```bash
cd server
npx prisma db push     # create/update the schema
npm run seed           # reset and load demo data
npx prisma studio      # browse the data
```

The seed loads: 1 admin, 2 customers, 5 agents, 3 zones with 12 postal-code
mappings, B2B and B2C rate cards with intra/inter rules, COD surcharges, and 6
orders spread across delivered, out-for-delivery, in-transit, failed and
pending-assignment states.

Schema details: [docs/database-schema.md](docs/database-schema.md).

---

## Seed credentials

All accounts use the password **`Password@123`**.

| Role | Email |
| --- | --- |
| Admin | `admin@lmdt.dev` |
| Customer | `ravi@customer.dev` |
| Customer | `meera@customer.dev` |
| Agent | `arjun@agent.dev` (Available, BLR-N) |
| Agent | `divya@agent.dev` (Available, BLR-S) |
| Agent | `karan@agent.dev` (Available, BLR-E) |
| Agent | `priya@agent.dev` (Busy, BLR-S) |
| Agent | `sanjay@agent.dev` (Offline, BLR-N) |

The login page has one-click buttons for the admin, customer and agent accounts.

**Serviceable postal codes** — BLR-N: 560001, 560003, 560024, 560064 ·
BLR-S: 560029, 560034, 560076, 560102 · BLR-E: 560037, 560048, 560066, 560093.
Same zone → intra-zone pricing; different zones → inter-zone.

---

## API documentation

Swagger UI: **http://localhost:4000/docs** · OpenAPI JSON: `/openapi.json`

Full reference with request bodies and role requirements:
[docs/api.md](docs/api.md). Pricing rules: [docs/rate-calculation.md](docs/rate-calculation.md).

Endpoint groups: `auth`, `quotes`, `orders`, `orders/:id/tracking`, `agents`,
`assignments`, `zones`, `rate-cards`, `cod`, `admin`.

---

## Testing

```bash
cd server
npm test
```

51 tests across 4 files:

| File | Covers |
| --- | --- |
| `tests/pricing.test.ts` | Volumetric weight, billable weight, B2B vs B2C, intra vs inter-zone, COD modes, minimum charge, configuration-driven rates |
| `tests/assignment.test.ts` | Haversine distance, nearest-agent selection, availability and capacity filtering, zone fallback, deterministic tie-breaks |
| `tests/lifecycle.test.ts` | Status transition matrix, terminal states, failure paths, reschedule path, role matrix |
| `tests/api.rbac.test.ts` | Login, token rejection, RBAC across all three roles, per-role list scoping, live quote endpoint |

`tests/api.rbac.test.ts` runs against the seeded database — run `npm run seed`
first if the data has drifted.

---

## Demo walkthrough

1. **Customer** (`ravi@customer.dev`) → *Create Order* → enter dimensions and
   postal codes → **Calculate price** → review the breakdown → **Confirm**.
2. **Admin** (`admin@lmdt.dev`) → *Orders* → **Auto-assign** on the new order.
   The banner names the agent, the method and the distance.
3. **Agent** (the assigned account) → *Assigned Orders* → advance Picked Up →
   In Transit → Out for Delivery, or **Mark delivery failed** with a reason.
4. **Customer** → the failed order → **Reschedule delivery** → pick a date. A new
   attempt is created and the previous one is preserved.
5. **Admin** → reassign the order, or override its status; every step appears in
   the tracking timeline and the notification log.

---

## Deployment

**Backend** (Railway / Render / Fly.io / any Node host)

```bash
cd server
npm ci && npx prisma generate && npm run build
npx prisma db push      # or `prisma migrate deploy` once migrations exist
node dist/index.js
```

Set `DATABASE_URL`, `JWT_SECRET`, `PORT` and `CORS_ORIGIN` (your frontend origin)
as environment variables on the host. Use a managed PostgreSQL instance.

**Frontend** (Vercel / Netlify / any static host)

```bash
cd web
npm ci && npm run build      # outputs web/dist
```

Serve `web/dist` and route `/api/*` to the backend — either with a host rewrite
rule or by putting both behind one reverse proxy. In development the Vite proxy
in `vite.config.ts` already does this.

**Checklist:** strong `JWT_SECRET`, `CORS_ORIGIN` restricted to your domain,
HTTPS everywhere, real SMTP/SMS credentials with `NOTIFICATION_DRIVER` pointed at
a live adapter, and `npm run seed` **not** run against production.

---

## Known limitations

- Notifications are logged, not actually sent — the console adapter is the demo default.
- Schema is applied with `prisma db push`; there is no migration history yet.
- Zone resolution uses postal-code mappings rather than a geocoding service.
- Tracking updates are fetched on load; there is no websocket push.
- Notifications are dispatched in-process rather than through a queue.
