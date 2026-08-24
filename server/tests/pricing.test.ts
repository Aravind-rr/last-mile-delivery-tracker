import { describe, expect, it } from 'vitest';
import { ZoneScope } from '@prisma/client';
import {
  billableWeight,
  computePrice,
  resolveZoneScope,
  volumetricWeight,
  type PriceComputationConfig,
} from '../src/services/pricing';

const b2cCard: PriceComputationConfig = {
  rateCard: { id: 'rc1', name: 'B2C Standard', currency: 'INR', volumetricDivisor: 5000, fuelSurchargePercent: 6, taxPercent: 18 },
  rule: { baseCharge: 45, includedWeightKg: 1, perKgCharge: 18, minCharge: 45 },
  cod: { mode: 'HIGHER_OF_BOTH', flatAmount: 35, percentOfValue: 1.5, minAmount: 35 },
};

const b2bCard: PriceComputationConfig = {
  rateCard: { id: 'rc2', name: 'B2B Contract', currency: 'INR', volumetricDivisor: 5000, fuelSurchargePercent: 8, taxPercent: 18 },
  rule: { baseCharge: 90, includedWeightKg: 5, perKgCharge: 14, minCharge: 90 },
  cod: { mode: 'HIGHER_OF_BOTH', flatAmount: 60, percentOfValue: 1, minAmount: 60 },
};

const pkg = {
  lengthCm: 30, breadthCm: 20, heightCm: 15,
  actualWeightKg: 2, serviceType: 'B2C' as const, paymentType: 'PREPAID' as const, declaredValue: 0,
};

describe('volumetric weight', () => {
  it('is L x B x H divided by the configured divisor', () => {
    expect(volumetricWeight({ lengthCm: 30, breadthCm: 20, heightCm: 15 }, 5000)).toBe(1.8);
    expect(volumetricWeight({ lengthCm: 40, breadthCm: 30, heightCm: 25 }, 5000)).toBe(6);
  });

  it('honours a different divisor from the rate card', () => {
    expect(volumetricWeight({ lengthCm: 40, breadthCm: 30, heightCm: 25 }, 6000)).toBe(5);
  });

  it('rejects a zero divisor', () => {
    expect(() => volumetricWeight({ lengthCm: 10, breadthCm: 10, heightCm: 10 }, 0)).toThrow();
  });
});

describe('billable weight', () => {
  it('uses the actual weight when it is heavier', () => {
    expect(billableWeight(5, 1.8)).toBe(5);
  });
  it('uses the volumetric weight when it is heavier', () => {
    expect(billableWeight(2, 6)).toBe(6);
  });
  it('is stable when both are equal', () => {
    expect(billableWeight(4, 4)).toBe(4);
  });
});

describe('zone scope', () => {
  it('is intra-zone when pickup and drop share a zone', () => {
    expect(resolveZoneScope('z1', 'z1')).toBe(ZoneScope.INTRA_ZONE);
  });
  it('is inter-zone otherwise', () => {
    expect(resolveZoneScope('z1', 'z2')).toBe(ZoneScope.INTER_ZONE);
  });
});

describe('B2C pricing', () => {
  it('prices an intra-zone prepaid shipment from the rate card', () => {
    const r = computePrice(pkg, ZoneScope.INTRA_ZONE, b2cCard);
    // billable 2 kg -> 1 kg beyond the included kg
    expect(r.billableWeightKg).toBe(2);
    expect(r.baseCharge).toBe(45);
    expect(r.weightCharge).toBe(18);
    expect(r.fuelSurcharge).toBe(3.78);   // 6% of 63
    expect(r.codCharge).toBe(0);
    expect(r.taxAmount).toBe(12.02);      // 18% of 66.78
    expect(r.totalPrice).toBe(78.8);
  });

  it('charges more inter-zone than intra-zone for the same package', () => {
    const intra = computePrice(pkg, ZoneScope.INTRA_ZONE, b2cCard);
    const inter = computePrice(pkg, ZoneScope.INTER_ZONE, {
      ...b2cCard,
      rule: { baseCharge: 75, includedWeightKg: 1, perKgCharge: 28, minCharge: 75 },
    });
    expect(inter.totalPrice).toBeGreaterThan(intra.totalPrice);
  });

  it('bills the volumetric weight when the package is bulky and light', () => {
    const r = computePrice(
      { ...pkg, lengthCm: 40, breadthCm: 30, heightCm: 25, actualWeightKg: 4 },
      ZoneScope.INTER_ZONE,
      { ...b2cCard, rule: { baseCharge: 75, includedWeightKg: 1, perKgCharge: 28, minCharge: 75 } },
    );
    expect(r.billableWeightSource).toBe('VOLUMETRIC');
    expect(r.billableWeightKg).toBe(6);
    expect(r.weightCharge).toBe(140); // 5 extra kg x 28
  });
});

describe('B2B vs B2C pricing', () => {
  it('applies the B2B allowance so a 5 kg shipment carries no weight charge', () => {
    const heavy = { ...pkg, actualWeightKg: 5, serviceType: 'B2B' as const };
    const r = computePrice(heavy, ZoneScope.INTRA_ZONE, b2bCard);
    expect(r.baseCharge).toBe(90);
    expect(r.weightCharge).toBe(0);
  });

  it('produces a different total than B2C for the same shipment', () => {
    const shipment = { ...pkg, actualWeightKg: 5 };
    const b2c = computePrice({ ...shipment, serviceType: 'B2C' }, ZoneScope.INTRA_ZONE, b2cCard);
    const b2b = computePrice({ ...shipment, serviceType: 'B2B' }, ZoneScope.INTRA_ZONE, b2bCard);
    expect(b2b.totalPrice).not.toBe(b2c.totalPrice);
  });
});

describe('COD surcharge', () => {
  it('adds nothing for a prepaid order', () => {
    expect(computePrice(pkg, ZoneScope.INTRA_ZONE, b2cCard).codCharge).toBe(0);
  });

  it('takes the higher of the flat fee and the percentage of declared value', () => {
    const r = computePrice({ ...pkg, paymentType: 'COD', declaredValue: 4500 }, ZoneScope.INTRA_ZONE, b2cCard);
    expect(r.codCharge).toBe(67.5); // 1.5% of 4500 beats the flat 35
  });

  it('falls back to the flat fee for a low declared value', () => {
    const r = computePrice({ ...pkg, paymentType: 'COD', declaredValue: 500 }, ZoneScope.INTRA_ZONE, b2cCard);
    expect(r.codCharge).toBe(35);
  });

  it('honours a flat-only configuration', () => {
    const r = computePrice({ ...pkg, paymentType: 'COD', declaredValue: 90000 }, ZoneScope.INTRA_ZONE, {
      ...b2cCard,
      cod: { mode: 'FLAT', flatAmount: 35, percentOfValue: 1.5, minAmount: 0 },
    });
    expect(r.codCharge).toBe(35);
  });

  it('increases the total relative to the same prepaid shipment', () => {
    const prepaid = computePrice(pkg, ZoneScope.INTRA_ZONE, b2cCard);
    const cod = computePrice({ ...pkg, paymentType: 'COD', declaredValue: 1000 }, ZoneScope.INTRA_ZONE, b2cCard);
    expect(cod.totalPrice).toBeGreaterThan(prepaid.totalPrice);
  });
});

describe('rate configuration is never hardcoded', () => {
  it('changing the rate card changes the price', () => {
    const cheap = computePrice(pkg, ZoneScope.INTRA_ZONE, b2cCard);
    const dear = computePrice(pkg, ZoneScope.INTRA_ZONE, {
      ...b2cCard,
      rule: { ...b2cCard.rule, baseCharge: 90, perKgCharge: 36 },
    });
    expect(dear.totalPrice).toBeGreaterThan(cheap.totalPrice);
  });

  it('applies the minimum charge when the computed subtotal is lower', () => {
    const r = computePrice({ ...pkg, actualWeightKg: 0.4, lengthCm: 5, breadthCm: 5, heightCm: 5 }, ZoneScope.INTRA_ZONE, {
      ...b2cCard,
      rule: { baseCharge: 20, includedWeightKg: 1, perKgCharge: 18, minCharge: 60 },
    });
    expect(r.baseCharge + r.weightCharge).toBe(60);
  });
});
