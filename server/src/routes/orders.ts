import { Router } from 'express';
import { z } from 'zod';
import { OrderStatus, PaymentType, Prisma, Role, ServiceType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errors';
import { actorOf, authenticate, requireRole } from '../middleware/auth';
import { quote } from '../services/pricing';
import {
  assertOrderVisible,
  changeStatus,
  createOrder,
  getOrder,
  orderInclude,
  rescheduleOrder,
} from '../services/orders';
import { forbidden } from '../lib/http';

export const quoteRouter = Router();
export const orderRouter = Router();

const addressSchema = z.object({
  contactName: z.string().min(2),
  contactPhone: z.string().min(6),
  line1: z.string().min(3),
  line2: z.string().optional(),
  city: z.string().min(2),
  state: z.string().min(2),
  postalCode: z.string().min(3),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const quoteSchema = z.object({
  serviceType: z.nativeEnum(ServiceType),
  paymentType: z.nativeEnum(PaymentType),
  lengthCm: z.number().positive(),
  breadthCm: z.number().positive(),
  heightCm: z.number().positive(),
  actualWeightKg: z.number().positive(),
  declaredValue: z.number().min(0).optional(),
  pickupPostalCode: z.string().min(3),
  dropPostalCode: z.string().min(3),
});

quoteRouter.post(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await quote(quoteSchema.parse(req.body)));
  }),
);

const createSchema = quoteSchema
  .omit({ pickupPostalCode: true, dropPostalCode: true })
  .extend({
    customerId: z.string().optional(),
    notes: z.string().optional(),
    pickup: addressSchema,
    drop: addressSchema,
  });

orderRouter.post(
  '/',
  authenticate,
  requireRole(Role.CUSTOMER, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const actor = actorOf(req);
    const customerId = actor.role === Role.ADMIN ? body.customerId : actor.id;
    if (!customerId) throw forbidden('customerId is required when an admin books on behalf of a customer');
    const order = await createOrder({ ...body, customerId }, actor);
    res.status(201).json(order);
  }),
);

orderRouter.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const q = z
      .object({
        status: z.string().optional(),
        zoneId: z.string().optional(),
        agentId: z.string().optional(),
        customerId: z.string().optional(),
        search: z.string().optional(),
      })
      .parse(req.query);

    const where: Prisma.OrderWhereInput = {};
    if (actor.role === Role.CUSTOMER) where.customerId = actor.id;
    if (actor.role === Role.AGENT) where.currentAgentId = req.user!.agentProfileId ?? '__none__';
    if (actor.role === Role.ADMIN) {
      if (q.agentId) where.currentAgentId = q.agentId;
      if (q.customerId) where.customerId = q.customerId;
    }
    if (q.status) where.status = { in: q.status.split(',') as OrderStatus[] };
    if (q.zoneId) where.OR = [{ pickupZoneId: q.zoneId }, { dropZoneId: q.zoneId }];
    if (q.search) {
      where.AND = [
        {
          OR: [
            { code: { contains: q.search, mode: 'insensitive' } },
            { customer: { name: { contains: q.search, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(orders);
  }),
);

orderRouter.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const order = await getOrder(req.params.id);
    assertOrderVisible(order, actorOf(req), req.user!.agentProfileId);
    res.json(order);
  }),
);

orderRouter.get(
  '/:id/tracking',
  authenticate,
  asyncHandler(async (req, res) => {
    const order = await getOrder(req.params.id);
    assertOrderVisible(order, actorOf(req), req.user!.agentProfileId);
    res.json({
      code: order.code,
      status: order.status,
      currentAgent: order.currentAgent?.user ?? null,
      attempts: order.attempts,
      assignments: order.assignments,
      timeline: order.statusHistory,
    });
  }),
);

orderRouter.patch(
  '/:id/status',
  authenticate,
  requireRole(Role.AGENT, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        status: z.nativeEnum(OrderStatus),
        note: z.string().optional(),
        failureReason: z.string().optional(),
        override: z.boolean().optional(),
      })
      .parse(req.body);
    const order = await changeStatus({
      orderId: req.params.id,
      newStatus: body.status,
      note: body.note,
      failureReason: body.failureReason,
      override: body.override,
      actor: actorOf(req),
      agentProfileId: req.user!.agentProfileId,
    });
    res.json(order);
  }),
);

orderRouter.post(
  '/:id/reschedule',
  authenticate,
  requireRole(Role.CUSTOMER, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const body = z.object({ scheduledDate: z.string(), note: z.string().optional() }).parse(req.body);
    const order = await rescheduleOrder({
      orderId: req.params.id,
      scheduledDate: new Date(body.scheduledDate),
      note: body.note,
      actor: actorOf(req),
    });
    res.json(order);
  }),
);
