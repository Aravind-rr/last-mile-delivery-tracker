import { Router } from 'express';
import { z } from 'zod';
import { AgentStatus, OrderStatus, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errors';
import { authenticate, requireRole } from '../middleware/auth';
import { forbidden, notFound } from '../lib/http';
import { orderInclude } from '../services/orders';

export const agentRouter = Router();

const ACTIVE: OrderStatus[] = [
  OrderStatus.ASSIGNED,
  OrderStatus.PICKED_UP,
  OrderStatus.IN_TRANSIT,
  OrderStatus.OUT_FOR_DELIVERY,
];

agentRouter.get(
  '/',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const q = z.object({ status: z.nativeEnum(AgentStatus).optional(), zoneId: z.string().optional() }).parse(req.query);
    const agents = await prisma.agentProfile.findMany({
      where: { status: q.status, baseZoneId: q.zoneId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        baseZone: true,
        _count: { select: { currentOrders: { where: { status: { in: ACTIVE } } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(agents);
  }),
);

agentRouter.get(
  '/me',
  authenticate,
  requireRole(Role.AGENT),
  asyncHandler(async (req, res) => {
    const profile = await prisma.agentProfile.findUnique({
      where: { userId: req.user!.id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        baseZone: true,
        _count: { select: { currentOrders: { where: { status: { in: ACTIVE } } } } },
      },
    });
    if (!profile) throw notFound('Agent profile not found');
    res.json(profile);
  }),
);

agentRouter.patch(
  '/me/availability',
  authenticate,
  requireRole(Role.AGENT),
  asyncHandler(async (req, res) => {
    const body = z.object({ status: z.nativeEnum(AgentStatus) }).parse(req.body);
    const profile = await prisma.agentProfile.update({
      where: { userId: req.user!.id },
      data: { status: body.status },
    });
    res.json(profile);
  }),
);

agentRouter.patch(
  '/me/location',
  authenticate,
  requireRole(Role.AGENT),
  asyncHandler(async (req, res) => {
    const body = z
      .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), baseZoneId: z.string().optional() })
      .parse(req.body);
    const profile = await prisma.agentProfile.update({
      where: { userId: req.user!.id },
      data: { ...body, locationUpdatedAt: new Date() },
    });
    res.json(profile);
  }),
);

agentRouter.get(
  '/me/orders',
  authenticate,
  requireRole(Role.AGENT),
  asyncHandler(async (req, res) => {
    const profileId = req.user!.agentProfileId;
    if (!profileId) throw forbidden('No agent profile linked to this account');
    const orders = await prisma.order.findMany({
      where: { currentAgentId: profileId },
      include: orderInclude,
      orderBy: { updatedAt: 'desc' },
    });
    res.json(orders);
  }),
);

// Admin: update any agent (status, base zone, coordinates).
agentRouter.patch(
  '/:id',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        status: z.nativeEnum(AgentStatus).optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        baseZoneId: z.string().nullable().optional(),
        maxActiveOrders: z.number().int().positive().optional(),
      })
      .parse(req.body);
    const profile = await prisma.agentProfile.update({ where: { id: req.params.id }, data: body });
    res.json(profile);
  }),
);
