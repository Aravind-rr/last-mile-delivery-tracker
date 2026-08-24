import {
  AddressKind,
  AttemptStatus,
  OrderStatus,
  PaymentType,
  Prisma,
  Role,
  ServiceType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../lib/http';
import { asPrismaJson, quote, resolveZoneByPostalCode, resolveZoneScope } from './pricing';
import { notifyStatusChange, notify } from './notifications';

export interface ActorContext {
  id: string;
  name: string;
  role: Role;
}

/**
 * Allowed forward transitions. Anything not listed here is rejected, which keeps
 * the lifecycle deterministic for agents and customers. Admins may override.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_ASSIGNMENT: [OrderStatus.ASSIGNED, OrderStatus.CANCELLED],
  ASSIGNED: [OrderStatus.PICKED_UP, OrderStatus.FAILED, OrderStatus.CANCELLED],
  PICKED_UP: [OrderStatus.IN_TRANSIT, OrderStatus.FAILED],
  IN_TRANSIT: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.FAILED],
  OUT_FOR_DELIVERY: [OrderStatus.DELIVERED, OrderStatus.FAILED],
  DELIVERED: [],
  FAILED: [OrderStatus.RESCHEDULED, OrderStatus.CANCELLED],
  RESCHEDULED: [OrderStatus.ASSIGNED, OrderStatus.CANCELLED],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Appends an immutable tracking record. History rows are never updated. */
export async function recordStatusChange(
  tx: Prisma.TransactionClient,
  data: {
    orderId: string;
    attemptId?: string | null;
    previousStatus: OrderStatus | null;
    newStatus: OrderStatus;
    actor: ActorContext | null;
    note?: string | null;
  },
) {
  return tx.orderStatusHistory.create({
    data: {
      orderId: data.orderId,
      attemptId: data.attemptId ?? undefined,
      previousStatus: data.previousStatus,
      newStatus: data.newStatus,
      actorId: data.actor?.id,
      actorRole: data.actor?.role,
      actorLabel: data.actor ? `${data.actor.name} (${data.actor.role})` : 'SYSTEM',
      note: data.note ?? undefined,
    },
  });
}

async function nextOrderCode(tx: Prisma.TransactionClient): Promise<string> {
  const count = await tx.order.count();
  return `LMD${String(100000 + count + 1).slice(1)}`;
}

export interface CreateOrderInput {
  customerId: string;
  serviceType: ServiceType;
  paymentType: PaymentType;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  actualWeightKg: number;
  declaredValue?: number;
  notes?: string;
  pickup: AddressInput;
  drop: AddressInput;
}

export interface AddressInput {
  contactName: string;
  contactPhone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  latitude?: number;
  longitude?: number;
}

export async function createOrder(input: CreateOrderInput, actor: ActorContext) {
  const customer = await prisma.user.findUnique({ where: { id: input.customerId } });
  if (!customer || customer.role !== Role.CUSTOMER) throw badRequest('Customer not found');

  const priced = await quote({
    lengthCm: input.lengthCm,
    breadthCm: input.breadthCm,
    heightCm: input.heightCm,
    actualWeightKg: input.actualWeightKg,
    serviceType: input.serviceType,
    paymentType: input.paymentType,
    declaredValue: input.declaredValue,
    pickupPostalCode: input.pickup.postalCode,
    dropPostalCode: input.drop.postalCode,
  });

  const order = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.order.create({
      data: {
        code: await nextOrderCode(tx),
        customerId: customer.id,
        createdById: actor.id,
        serviceType: input.serviceType,
        paymentType: input.paymentType,
        status: OrderStatus.PENDING_ASSIGNMENT,
        lengthCm: input.lengthCm,
        breadthCm: input.breadthCm,
        heightCm: input.heightCm,
        actualWeightKg: input.actualWeightKg,
        volumetricWeightKg: priced.volumetricWeightKg,
        billableWeightKg: priced.billableWeightKg,
        declaredValue: input.declaredValue ?? 0,
        pickupZoneId: priced.pickupZone.id,
        dropZoneId: priced.dropZone.id,
        zoneScope: priced.zoneScope,
        rateCardId: priced.rateCardId,
        baseCharge: priced.baseCharge,
        weightCharge: priced.weightCharge,
        fuelSurcharge: priced.fuelSurcharge,
        codCharge: priced.codCharge,
        taxAmount: priced.taxAmount,
        totalPrice: priced.totalPrice,
        priceBreakdown: asPrismaJson(priced),
        notes: input.notes,
        addresses: {
          create: [
            { ...toAddressRow(input.pickup, AddressKind.PICKUP, priced.pickupZone.id) },
            { ...toAddressRow(input.drop, AddressKind.DROP, priced.dropZone.id) },
          ],
        },
      },
    });

    const attempt = await tx.deliveryAttempt.create({
      data: {
        orderId: created.id,
        attemptNumber: 1,
        status: AttemptStatus.SCHEDULED,
        scheduledFor: new Date(),
      },
    });

    await recordStatusChange(tx, {
      orderId: created.id,
      attemptId: attempt.id,
      previousStatus: null,
      newStatus: OrderStatus.PENDING_ASSIGNMENT,
      actor,
      note: `Order booked (${priced.zoneScope}, ${priced.serviceType}, ${priced.paymentType}) — total ${priced.currency} ${priced.totalPrice}`,
    });

    return created;
  });

  await notifyStatusChange(order.id, OrderStatus.PENDING_ASSIGNMENT);
  return getOrder(order.id);
}

function toAddressRow(a: AddressInput, kind: AddressKind, zoneId: string) {
  return {
    kind,
    contactName: a.contactName,
    contactPhone: a.contactPhone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state,
    postalCode: a.postalCode,
    latitude: a.latitude,
    longitude: a.longitude,
    zoneId,
  };
}

export const orderInclude = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  createdBy: { select: { id: true, name: true, role: true } },
  pickupZone: true,
  dropZone: true,
  rateCard: true,
  addresses: { include: { zone: true } },
  currentAgent: { include: { user: { select: { id: true, name: true, phone: true, email: true } } } },
  attempts: { orderBy: { attemptNumber: 'asc' as const }, include: { agent: { include: { user: { select: { name: true } } } } } },
  assignments: {
    orderBy: { assignedAt: 'desc' as const },
    include: { agent: { include: { user: { select: { name: true } } } }, assignedBy: { select: { name: true, role: true } } },
  },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;

export async function getOrder(id: string) {
  const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  if (!order) throw notFound('Order not found');
  return order;
}

export function assertOrderVisible(order: { customerId: string; currentAgentId: string | null }, actor: ActorContext, agentProfileId?: string | null) {
  if (actor.role === Role.ADMIN) return;
  if (actor.role === Role.CUSTOMER && order.customerId === actor.id) return;
  if (actor.role === Role.AGENT && agentProfileId && order.currentAgentId === agentProfileId) return;
  throw forbidden('You do not have access to this order');
}

const AGENT_ALLOWED: OrderStatus[] = [
  OrderStatus.PICKED_UP,
  OrderStatus.IN_TRANSIT,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
  OrderStatus.FAILED,
];

export interface StatusChangeInput {
  orderId: string;
  newStatus: OrderStatus;
  note?: string;
  failureReason?: string;
  actor: ActorContext;
  agentProfileId?: string | null;
  override?: boolean;
}

/**
 * Single entry point for every lifecycle change. Validates the transition,
 * updates attempt bookkeeping, releases the agent on failure/terminal states,
 * writes an immutable history row and fires a notification event.
 */
export async function changeStatus(input: StatusChangeInput) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } },
  });
  if (!order) throw notFound('Order not found');

  if (input.actor.role === Role.AGENT) {
    if (!input.agentProfileId || order.currentAgentId !== input.agentProfileId) {
      throw forbidden('This order is not assigned to you');
    }
    if (!AGENT_ALLOWED.includes(input.newStatus)) {
      throw forbidden(`Agents cannot move an order to ${input.newStatus}`);
    }
  } else if (input.actor.role === Role.CUSTOMER) {
    throw forbidden('Customers cannot change order status directly');
  }

  const isOverride = input.override === true && input.actor.role === Role.ADMIN;
  if (!isOverride && !canTransition(order.status, input.newStatus)) {
    throw conflict(`Illegal transition ${order.status} -> ${input.newStatus}`);
  }
  if (input.newStatus === OrderStatus.FAILED && !input.failureReason) {
    throw badRequest('A failure reason is required when marking a delivery as failed');
  }

  const attempt = order.attempts[0];
  const note = input.newStatus === OrderStatus.FAILED ? input.failureReason : input.note;

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const data: Prisma.OrderUpdateInput = { status: input.newStatus };

    if (input.newStatus === OrderStatus.DELIVERED) {
      data.deliveredAt = new Date();
      data.currentAgent = { disconnect: true };
    }

    await tx.order.update({ where: { id: order.id }, data });

    if (attempt) {
      const attemptData: Prisma.DeliveryAttemptUpdateInput = {};
      if (input.newStatus === OrderStatus.PICKED_UP) {
        attemptData.status = AttemptStatus.IN_PROGRESS;
        attemptData.startedAt = new Date();
      }
      if (input.newStatus === OrderStatus.DELIVERED) {
        attemptData.status = AttemptStatus.DELIVERED;
        attemptData.completedAt = new Date();
      }
      if (input.newStatus === OrderStatus.FAILED) {
        attemptData.status = AttemptStatus.FAILED;
        attemptData.completedAt = new Date();
        attemptData.failureReason = input.failureReason;
      }
      if (Object.keys(attemptData).length > 0) {
        await tx.deliveryAttempt.update({ where: { id: attempt.id }, data: attemptData });
      }
    }

    if (input.newStatus === OrderStatus.FAILED) {
      // Release the agent so they can take other work while the customer reschedules.
      await tx.agentAssignment.updateMany({
        where: { orderId: order.id, isActive: true },
        data: { isActive: false, releasedAt: new Date() },
      });
      await tx.order.update({ where: { id: order.id }, data: { currentAgentId: null } });
    }

    await recordStatusChange(tx, {
      orderId: order.id,
      attemptId: attempt?.id,
      previousStatus: order.status,
      newStatus: input.newStatus,
      actor: input.actor,
      note: isOverride ? `[ADMIN OVERRIDE] ${note ?? ''}`.trim() : note,
    });
  });

  await notifyStatusChange(order.id, input.newStatus, note);
  return getOrder(order.id);
}

/**
 * Customer-driven reschedule of a failed delivery. Creates a fresh delivery
 * attempt; the failed attempt and its history are preserved untouched.
 */
export async function rescheduleOrder(opts: {
  orderId: string;
  scheduledDate: Date;
  note?: string;
  actor: ActorContext;
}) {
  const order = await prisma.order.findUnique({
    where: { id: opts.orderId },
    include: { attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 }, customer: true },
  });
  if (!order) throw notFound('Order not found');
  if (order.status !== OrderStatus.FAILED) {
    throw conflict('Only a failed delivery can be rescheduled');
  }
  if (opts.actor.role === Role.CUSTOMER && order.customerId !== opts.actor.id) {
    throw forbidden('You do not have access to this order');
  }
  if (opts.scheduledDate.getTime() < Date.now() - 60_000) {
    throw badRequest('The reschedule date must be in the future');
  }

  const nextNumber = (order.attempts[0]?.attemptNumber ?? 0) + 1;

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const attempt = await tx.deliveryAttempt.create({
      data: {
        orderId: order.id,
        attemptNumber: nextNumber,
        status: AttemptStatus.SCHEDULED,
        scheduledFor: opts.scheduledDate,
        notes: opts.note,
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.RESCHEDULED, scheduledDate: opts.scheduledDate, currentAgentId: null },
    });
    await recordStatusChange(tx, {
      orderId: order.id,
      attemptId: attempt.id,
      previousStatus: OrderStatus.FAILED,
      newStatus: OrderStatus.RESCHEDULED,
      actor: opts.actor,
      note: `Delivery attempt #${nextNumber} scheduled for ${opts.scheduledDate.toDateString()}${opts.note ? ` — ${opts.note}` : ''}`,
    });
  });

  await notify({
    orderId: order.id,
    userId: order.customerId,
    event: 'ORDER_RESCHEDULED',
    subject: `Order ${order.code}: rescheduled`,
    body: `Delivery attempt #${nextNumber} for order ${order.code} is scheduled for ${opts.scheduledDate.toDateString()}. The order is back in the assignment queue.`,
    emailTo: order.customer.email,
    phoneTo: order.customer.phone,
  });

  return getOrder(order.id);
}
