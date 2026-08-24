import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AgentStatus, OrderStatus, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errors';
import { authenticate, requireRole } from '../middleware/auth';

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole(Role.ADMIN));

adminRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [byStatus, totals, agents, revenue, recent] = await Promise.all([
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.order.count(),
      prisma.agentProfile.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.order.aggregate({ _sum: { totalPrice: true } }),
      prisma.order.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, email: true, phone: true } },
          currentAgent: { include: { user: { select: { id: true, name: true, phone: true } } } },
          pickupZone: true,
          dropZone: true,
        },
      }),
    ]);

    res.json({
      totalOrders: totals,
      revenue: revenue._sum.totalPrice ?? 0,
      ordersByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) as Record<OrderStatus, number>,
      agentsByStatus: Object.fromEntries(agents.map((r) => [r.status, r._count._all])) as Record<AgentStatus, number>,
      pendingAssignment: byStatus.find((r) => r.status === OrderStatus.PENDING_ASSIGNMENT)?._count._all ?? 0,
      recentOrders: recent,
    });
  }),
);

adminRouter.get(
  '/customers',
  asyncHandler(async (_req, res) => {
    res.json(
      await prisma.user.findMany({
        where: { role: Role.CUSTOMER },
        select: { id: true, name: true, email: true, phone: true, _count: { select: { orders: true } } },
        orderBy: { name: 'asc' },
      }),
    );
  }),
);

adminRouter.get(
  '/notifications',
  asyncHandler(async (_req, res) => {
    res.json(
      await prisma.notification.findMany({
        take: 100,
        orderBy: { createdAt: 'desc' },
        include: { order: { select: { code: true } } },
      }),
    );
  }),
);

/** Creates an agent account together with its profile. */
adminRouter.post(
  '/agents',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(6),
        phone: z.string().optional(),
        vehicleType: z.string().optional(),
        baseZoneId: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
      })
      .parse(req.body);

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        phone: body.phone,
        role: Role.AGENT,
        passwordHash: await bcrypt.hash(body.password, 10),
        agentProfile: {
          create: {
            vehicleType: body.vehicleType ?? 'BIKE',
            baseZoneId: body.baseZoneId,
            latitude: body.latitude,
            longitude: body.longitude,
            status: AgentStatus.OFFLINE,
          },
        },
      },
      include: { agentProfile: true },
    });
    res.status(201).json(user);
  }),
);
