import { Router } from 'express';
import { z } from 'zod';
import { CodMode, Role, ServiceType, ZoneScope } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errors';
import { authenticate, requireRole } from '../middleware/auth';

export const zoneRouter = Router();
export const rateCardRouter = Router();
export const codRouter = Router();

// ------------------------------------------------------------------ zones

zoneRouter.get(
  '/',
  authenticate,
  asyncHandler(async (_req, res) => {
    const zones = await prisma.zone.findMany({
      include: { areas: { orderBy: { postalCode: 'asc' } }, _count: { select: { agents: true } } },
      orderBy: { code: 'asc' },
    });
    res.json(zones);
  }),
);

const zoneSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  city: z.string().min(2),
  centerLat: z.number().optional(),
  centerLng: z.number().optional(),
  isActive: z.boolean().optional(),
});

zoneRouter.post(
  '/',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(async (req, res) => {
    res.status(201).json(await prisma.zone.create({ data: zoneSchema.parse(req.body) }));
  }),
);

zoneRouter.patch(
  '/:id',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(async (req, res) => {
    res.json(await prisma.zone.update({ where: { id: req.params.id }, data: zoneSchema.partial().parse(req.body) }));
  }),
);

zoneRouter.post(
  '/:id/areas',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const body = z.object({ postalCode: z.string().min(3), areaName: z.string().min(2) }).parse(req.body);
    const area = await prisma.zoneArea.create({ data: { ...body, zoneId: req.params.id } });
    res.status(201).json(area);
  }),
);

zoneRouter.delete(
  '/areas/:areaId',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(async (req, res) => {
    await prisma.zoneArea.delete({ where: { id: req.params.areaId } });
    res.status(204).end();
  }),
);

// -------------------------------------------------------------- rate cards

rateCardRouter.get(
  '/',
  authenticate,
  asyncHandler(async (_req, res) => {
    const cards = await prisma.rateCard.findMany({
      include: { rules: { orderBy: { scope: 'asc' } } },
      orderBy: [{ serviceType: 'asc' }, { effectiveFrom: 'desc' }],
    });
    res.json(cards);
  }),
);

const rateCardSchema = z.object({
  name: z.string().min(2),
  serviceType: z.nativeEnum(ServiceType),
  currency: z.string().optional(),
  volumetricDivisor: z.number().int().positive().optional(),
  fuelSurchargePercent: z.number().min(0).optional(),
  taxPercent: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

rateCardRouter.post(
  '/',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(async (req, res) => {
    res.status(201).json(await prisma.rateCard.create({ data: rateCardSchema.parse(req.body) }));
  }),
);

rateCardRouter.patch(
  '/:id',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.rateCard.update({ where: { id: req.params.id }, data: rateCardSchema.partial().parse(req.body) }),
    );
  }),
);

const ruleSchema = z.object({
  scope: z.nativeEnum(ZoneScope),
  baseCharge: z.number().min(0),
  includedWeightKg: z.number().positive(),
  perKgCharge: z.number().min(0),
  minCharge: z.number().min(0).optional(),
});

/** Upserts the intra/inter rule for a rate card. */
rateCardRouter.put(
  '/:id/rules',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const body = ruleSchema.parse(req.body);
    const rule = await prisma.rateRule.upsert({
      where: { rateCardId_scope: { rateCardId: req.params.id, scope: body.scope } },
      create: { ...body, rateCardId: req.params.id },
      update: body,
    });
    res.json(rule);
  }),
);

// ------------------------------------------------------------ cod surcharge

codRouter.get(
  '/',
  authenticate,
  asyncHandler(async (_req, res) => {
    res.json(await prisma.codSurcharge.findMany({ orderBy: { serviceType: 'asc' } }));
  }),
);

const codSchema = z.object({
  serviceType: z.nativeEnum(ServiceType),
  mode: z.nativeEnum(CodMode),
  flatAmount: z.number().min(0),
  percentOfValue: z.number().min(0),
  minAmount: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

codRouter.post(
  '/',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(async (req, res) => {
    res.status(201).json(await prisma.codSurcharge.create({ data: codSchema.parse(req.body) }));
  }),
);

codRouter.patch(
  '/:id',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.codSurcharge.update({ where: { id: req.params.id }, data: codSchema.partial().parse(req.body) }),
    );
  }),
);
