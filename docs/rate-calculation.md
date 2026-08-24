# Rate Calculation

Implemented in [`server/src/services/pricing.ts`](../server/src/services/pricing.ts)
and unit-tested in [`server/tests/pricing.test.ts`](../server/tests/pricing.test.ts).

## 1. Weights

```
volumetric weight (kg) = (L × B × H) / volumetricDivisor      # cm, divisor from the rate card (default 5000)
billable weight   (kg) = max(actual weight, volumetric weight)
```

The heavier of the two is always billed. The response reports which one won
(`billableWeightSource`), so the customer can see why.

## 2. Zone scope

The pickup and drop postal codes are looked up in `ZoneArea` (a unique postal
code → zone mapping). Then:

```
pickup zone == drop zone  →  INTRA_ZONE
otherwise                 →  INTER_ZONE
```

An unmapped postal code is rejected with a 400 rather than silently priced.

## 3. Rate selection

1. Pick the active `RateCard` for the order's **service type** (B2B or B2C); the
   most recent `effectiveFrom` wins.
2. Pick that card's `RateRule` for the resolved **zone scope**.

## 4. Charges

```
chargeable kg   = max(includedWeightKg, billable weight)
extra kg        = ceil(chargeable − includedWeightKg)          # whole-kg slabs, rounded up
base charge     = rule.baseCharge
weight charge   = extra kg × rule.perKgCharge
subtotal        = max(base charge + weight charge, rule.minCharge)
fuel surcharge  = subtotal × card.fuelSurchargePercent / 100
```

## 5. COD surcharge

Applied only when `paymentType = COD`, from the active `CodSurcharge` row for the
service type:

| Mode | Charge |
| --- | --- |
| `FLAT` | `flatAmount` |
| `PERCENT_OF_VALUE` | `declaredValue × percentOfValue / 100` |
| `HIGHER_OF_BOTH` | `max(flat, percent)` |

The result is then floored at `minAmount`.

## 6. Tax and total

```
taxable = subtotal + fuel surcharge + COD charge
tax     = taxable × card.taxPercent / 100
TOTAL   = taxable + tax
```

All money is rounded to 2 decimals at each step.

## 7. Worked example (seeded configuration)

Package 40 × 30 × 25 cm, actual weight 4 kg, **B2C**, **COD**, declared value
₹4,500, pickup 560034 (BLR-S) → drop 560048 (BLR-E).

| Step | Value |
| --- | --- |
| Volumetric | 40 × 30 × 25 / 5000 = **6 kg** |
| Billable | max(4, 6) = **6 kg** (volumetric) |
| Scope | BLR-S ≠ BLR-E → **INTER_ZONE** |
| Rule | base ₹75, includes 1 kg, ₹28/kg |
| Base charge | ₹75.00 |
| Weight charge | 5 kg × ₹28 = ₹140.00 |
| Subtotal | ₹215.00 |
| Fuel surcharge (6%) | ₹12.90 |
| COD (higher of ₹35 flat and 1.5% of ₹4,500 = ₹67.50) | ₹67.50 |
| Taxable | ₹295.40 |
| Tax (18%) | ₹53.17 |
| **Total** | **₹348.57** |

Verify it yourself:

```bash
curl -s -X POST http://localhost:4000/api/quotes -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"serviceType":"B2C","paymentType":"COD","lengthCm":40,"breadthCm":30,"heightCm":25,"actualWeightKg":4,"declaredValue":4500,"pickupPostalCode":"560034","dropPostalCode":"560048"}'
```

## 8. Nothing is hardcoded

Every number above — the divisor, base charge, included weight, per-kg rate,
minimum, fuel %, tax % and all three COD parameters — is a database column
editable from **Admin → Rate Cards**. Change a rule and the very next quote uses
it; the check is part of the test suite and of the end-to-end verification script.

Orders freeze their breakdown into `Order.priceBreakdown` at booking time, so a
later rate change never rewrites the price of an existing shipment.

## 9. Seeded rate cards

| Card | Scope | Base | Includes | Per extra kg | Min | Fuel | Tax |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B2C Standard 2026 | Intra | ₹45 | 1 kg | ₹18 | ₹45 | 6% | 18% |
| B2C Standard 2026 | Inter | ₹75 | 1 kg | ₹28 | ₹75 | 6% | 18% |
| B2B Contract 2026 | Intra | ₹90 | 5 kg | ₹14 | ₹90 | 8% | 18% |
| B2B Contract 2026 | Inter | ₹140 | 5 kg | ₹22 | ₹140 | 8% | 18% |

COD: B2C — higher of ₹35 or 1.5% of declared value (min ₹35).
B2B — higher of ₹60 or 1% of declared value (min ₹60).
