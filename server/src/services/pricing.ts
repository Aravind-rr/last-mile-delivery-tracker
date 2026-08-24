import { PaymentType, Prisma, ServiceType, ZoneScope } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { badRequest, notFound } from '../lib/http';

export interface Dimensions {
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
}

export interface QuoteInput extends Dimensions {
  actualWeightKg: number;
  serviceType: ServiceType;
  paymentType: PaymentType;
  declaredValue?: number;
  pickupPostalCode: string;
  dropPostalCode: string;
}

export interface PriceLine {
  label: string;
  amount: number;
  detail: string;
}

export interface QuoteResult {
  currency: string;
  rateCardId: string;
  rateCardName: string;
  serviceType: ServiceType;
  paymentType: PaymentType;
  zoneScope: ZoneScope;
  pickupZone: { id: string; code: string; name: string };
  dropZone: { id: string; code: string; name: string };
  volumetricDivisor: number;
  volumetricWeightKg: number;
  actualWeightKg: number;
  billableWeightKg: number;
  billableWeightSource: 'ACTUAL' | 'VOLUMETRIC';
  chargeableWeightKg: number;
  baseCharge: number;
  weightCharge: number;
  fuelSurcharge: number;
  codCharge: number;
  taxAmount: number;
  totalPrice: number;
  lines: PriceLine[];
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Volumetric weight in kg = (L x B x H) / divisor, dimensions in cm. */
export function volumetricWeight(dims: Dimensions, divisor: number): number {
  if (divisor <= 0) throw badRequest('Volumetric divisor must be greater than zero');
  return round2((dims.lengthCm * dims.breadthCm * dims.heightCm) / divisor);
}

/** Billed weight is always the higher of the actual and volumetric weights. */
export function billableWeight(actualWeightKg: number, volumetricWeightKg: number): number {
  return round2(Math.max(actualWeightKg, volumetricWeightKg));
}

export function resolveZoneScope(pickupZoneId: string, dropZoneId: string): ZoneScope {
  return pickupZoneId === dropZoneId ? ZoneScope.INTRA_ZONE : ZoneScope.INTER_ZONE;
}

export interface PriceComputationConfig {
  rateCard: {
    id: string;
    name: string;
    currency: string;
    volumetricDivisor: number;
    fuelSurchargePercent: number;
    taxPercent: number;
  };
  rule: {
    baseCharge: number;
    includedWeightKg: number;
    perKgCharge: number;
    minCharge: number;
  };
  cod: {
    mode: 'FLAT' | 'PERCENT_OF_VALUE' | 'HIGHER_OF_BOTH';
    flatAmount: number;
    percentOfValue: number;
    minAmount: number;
  } | null;
}

/**
 * Pure pricing calculation. Every number used here comes from admin-configured
 * database rows that the caller loads; nothing is hardcoded.
 */
export function computePrice(
  input: Omit<QuoteInput, 'pickupPostalCode' | 'dropPostalCode'>,
  scope: ZoneScope,
  config: PriceComputationConfig,
): Omit<QuoteResult, 'pickupZone' | 'dropZone'> {
  const { rateCard, rule, cod } = config;

  const volumetric = volumetricWeight(input, rateCard.volumetricDivisor);
  const billable = billableWeight(input.actualWeightKg, volumetric);
  const source: 'ACTUAL' | 'VOLUMETRIC' = volumetric > input.actualWeightKg ? 'VOLUMETRIC' : 'ACTUAL';

  // Weight is charged in whole kilogram slabs, rounded up.
  const chargeable = Math.max(rule.includedWeightKg, Math.ceil(billable * 100) / 100);
  const extraKg = Math.max(0, Math.ceil(chargeable - rule.includedWeightKg));

  const baseCharge = round2(rule.baseCharge);
  const weightCharge = round2(extraKg * rule.perKgCharge);
  let subtotal = round2(baseCharge + weightCharge);
  let minChargeApplied = 0;
  if (subtotal < rule.minCharge) {
    minChargeApplied = round2(rule.minCharge - subtotal);
    subtotal = round2(rule.minCharge);
  }

  const fuelSurcharge = round2((subtotal * rateCard.fuelSurchargePercent) / 100);

  let codCharge = 0;
  if (input.paymentType === PaymentType.COD && cod) {
    const declared = input.declaredValue ?? 0;
    const pct = round2((declared * cod.percentOfValue) / 100);
    if (cod.mode === 'FLAT') codCharge = cod.flatAmount;
    else if (cod.mode === 'PERCENT_OF_VALUE') codCharge = pct;
    else codCharge = Math.max(cod.flatAmount, pct);
    codCharge = round2(Math.max(codCharge, cod.minAmount));
  }

  const taxable = round2(subtotal + fuelSurcharge + codCharge);
  const taxAmount = round2((taxable * rateCard.taxPercent) / 100);
  const totalPrice = round2(taxable + taxAmount);

  const lines: PriceLine[] = [
    {
      label: `Base charge (${scope === ZoneScope.INTRA_ZONE ? 'intra-zone' : 'inter-zone'} / ${input.serviceType})`,
      amount: baseCharge,
      detail: `Covers first ${rule.includedWeightKg} kg`,
    },
    {
      label: 'Weight charge',
      amount: weightCharge,
      detail: `${extraKg} kg beyond ${rule.includedWeightKg} kg x ${rule.perKgCharge}/kg`,
    },
  ];
  if (minChargeApplied > 0) {
    lines.push({
      label: 'Minimum charge top-up',
      amount: minChargeApplied,
      detail: `Minimum billable value for this lane is ${rule.minCharge}`,
    });
  }
  lines.push({
    label: 'Fuel surcharge',
    amount: fuelSurcharge,
    detail: `${rateCard.fuelSurchargePercent}% of ${subtotal}`,
  });
  if (input.paymentType === PaymentType.COD) {
    lines.push({
      label: 'COD handling fee',
      amount: codCharge,
      detail: cod
        ? `${cod.mode.replace(/_/g, ' ').toLowerCase()} — flat ${cod.flatAmount} / ${cod.percentOfValue}% of declared value`
        : 'No COD surcharge configured',
    });
  }
  lines.push({
    label: 'Tax (GST)',
    amount: taxAmount,
    detail: `${rateCard.taxPercent}% of ${taxable}`,
  });

  return {
    currency: rateCard.currency,
    rateCardId: rateCard.id,
    rateCardName: rateCard.name,
    serviceType: input.serviceType,
    paymentType: input.paymentType,
    zoneScope: scope,
    volumetricDivisor: rateCard.volumetricDivisor,
    volumetricWeightKg: volumetric,
    actualWeightKg: round2(input.actualWeightKg),
    billableWeightKg: billable,
    billableWeightSource: source,
    chargeableWeightKg: chargeable,
    baseCharge,
    weightCharge: round2(weightCharge + minChargeApplied),
    fuelSurcharge,
    codCharge,
    taxAmount,
    totalPrice,
    lines,
  };
}

export async function resolveZoneByPostalCode(postalCode: string) {
  const area = await prisma.zoneArea.findUnique({
    where: { postalCode: postalCode.trim() },
    include: { zone: true },
  });
  if (!area) throw badRequest(`No serviceable zone is mapped to postal code ${postalCode}`);
  if (!area.zone.isActive) throw badRequest(`Zone ${area.zone.name} is currently inactive`);
  return area.zone;
}

/** Loads live configuration from the database and produces a full quote. */
export async function quote(input: QuoteInput): Promise<QuoteResult> {
  if (input.actualWeightKg <= 0) throw badRequest('Actual weight must be greater than zero');
  if (input.lengthCm <= 0 || input.breadthCm <= 0 || input.heightCm <= 0) {
    throw badRequest('Package dimensions must be greater than zero');
  }

  const [pickupZone, dropZone] = await Promise.all([
    resolveZoneByPostalCode(input.pickupPostalCode),
    resolveZoneByPostalCode(input.dropPostalCode),
  ]);

  const scope = resolveZoneScope(pickupZone.id, dropZone.id);

  const rateCard = await prisma.rateCard.findFirst({
    where: { serviceType: input.serviceType, isActive: true },
    orderBy: { effectiveFrom: 'desc' },
    include: { rules: true },
  });
  if (!rateCard) throw notFound(`No active ${input.serviceType} rate card is configured`);

  const rule = rateCard.rules.find((r) => r.scope === scope);
  if (!rule) throw notFound(`No ${scope} rate rule configured on rate card ${rateCard.name}`);

  const cod =
    input.paymentType === PaymentType.COD
      ? await prisma.codSurcharge.findFirst({
          where: { serviceType: input.serviceType, isActive: true },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

  const result = computePrice(input, scope, {
    rateCard,
    rule,
    cod: cod
      ? {
          mode: cod.mode,
          flatAmount: cod.flatAmount,
          percentOfValue: cod.percentOfValue,
          minAmount: cod.minAmount,
        }
      : null,
  });

  return {
    ...result,
    pickupZone: { id: pickupZone.id, code: pickupZone.code, name: pickupZone.name },
    dropZone: { id: dropZone.id, code: dropZone.code, name: dropZone.name },
  };
}

export const asPrismaJson = (v: unknown) => v as Prisma.InputJsonValue;
