import { AgentStatus, AssignmentMethod, OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, notFound } from '../lib/http';
import { recordStatusChange, ActorContext } from './orders';
import { notifyStatusChange } from './notifications';

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two coordinates, in kilometres. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export interface CandidateAgent {
  id: string;
  name: string;
  status: AgentStatus;
  latitude: number | null;
  longitude: number | null;
  baseZoneId: string | null;
  activeOrders: number;
  maxActiveOrders: number;
}

export interface SelectionResult {
  agentId: string;
  method: AssignmentMethod;
  distanceKm: number | null;
  reason: string;
}

/**
 * Deterministic nearest-agent selection.
 *  1. Only AVAILABLE agents with spare capacity are considered.
 *  2. If the pickup point and the agent both have coordinates, pick the
 *     smallest haversine distance.
 *  3. Otherwise fall back to agents based in the pickup zone.
 *  4. Ties are broken by fewest active orders, then by agent id (stable).
 */
export function selectAgent(
  candidates: CandidateAgent[],
  pickup: { lat: number | null; lng: number | null; zoneId: string },
): SelectionResult | null {
  const eligible = candidates.filter(
    (c) => c.status === AgentStatus.AVAILABLE && c.activeOrders < c.maxActiveOrders,
  );
  if (eligible.length === 0) return null;

  const geo = eligible.filter((c) => c.latitude !== null && c.longitude !== null);
  if (pickup.lat !== null && pickup.lng !== null && geo.length > 0) {
    const scored = geo
      .map((c) => ({
        c,
        d: haversineKm({ lat: pickup.lat as number, lng: pickup.lng as number }, {
          lat: c.latitude as number,
          lng: c.longitude as number,
        }),
      }))
      .sort((x, y) => x.d - y.d || x.c.activeOrders - y.c.activeOrders || x.c.id.localeCompare(y.c.id));
    const best = scored[0];
    return {
      agentId: best.c.id,
      method: AssignmentMethod.AUTO_NEAREST_COORDINATES,
      distanceKm: Math.round(best.d * 100) / 100,
      reason: `Nearest available agent (${best.c.name}) at ${best.d.toFixed(2)} km from the pickup point`,
    };
  }

  const zoneAgents = eligible.filter((c) => c.baseZoneId === pickup.zoneId);
  const pool = zoneAgents.length > 0 ? zoneAgents : eligible;
  const best = [...pool].sort(
    (x, y) => x.activeOrders - y.activeOrders || x.id.localeCompare(y.id),
  )[0];
  return {
    agentId: best.id,
    method: AssignmentMethod.AUTO_PICKUP_ZONE,
    distanceKm: null,
    reason:
      zoneAgents.length > 0
        ? `No coordinates available — selected ${best.name}, an available agent based in the pickup zone`
        : `No coordinates or zone match — selected ${best.name}, the least loaded available agent`,
  };
}

async function loadCandidates(): Promise<CandidateAgent[]> {
  const agents = await prisma.agentProfile.findMany({
    where: { status: AgentStatus.AVAILABLE, user: { isActive: true } },
    include: {
      user: true,
      _count: {
        select: {
          currentOrders: {
            where: {
              status: {
                in: [
                  OrderStatus.ASSIGNED,
                  OrderStatus.PICKED_UP,
                  OrderStatus.IN_TRANSIT,
                  OrderStatus.OUT_FOR_DELIVERY,
                ],
              },
            },
          },
        },
      },
    },
  });
  return agents.map((a) => ({
    id: a.id,
    name: a.user.name,
    status: a.status,
    latitude: a.latitude,
    longitude: a.longitude,
    baseZoneId: a.baseZoneId,
    activeOrders: a._count.currentOrders,
    maxActiveOrders: a.maxActiveOrders,
  }));
}

const ASSIGNABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING_ASSIGNMENT,
  OrderStatus.RESCHEDULED,
  OrderStatus.FAILED,
  OrderStatus.ASSIGNED,
];

/** Assigns an agent to an order, either manually or via the auto algorithm. */
export async function assignAgent(opts: {
  orderId: string;
  agentId?: string;
  actor: ActorContext;
}) {
  const order = await prisma.order.findUnique({
    where: { id: opts.orderId },
    include: {
      addresses: true,
      attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 },
    },
  });
  if (!order) throw notFound('Order not found');
  if (!ASSIGNABLE_STATUSES.includes(order.status)) {
    throw conflict(`An order in status ${order.status} cannot be assigned`);
  }

  const pickup = order.addresses.find((a) => a.kind === 'PICKUP');
  if (!pickup) throw badRequest('Order has no pickup address');

  let selection: SelectionResult;
  if (opts.agentId) {
    const agent = await prisma.agentProfile.findUnique({
      where: { id: opts.agentId },
      include: { user: true },
    });
    if (!agent) throw notFound('Agent not found');
    if (agent.status !== AgentStatus.AVAILABLE) {
      throw conflict(`Agent ${agent.user.name} is ${agent.status} and cannot take new orders`);
    }
    const distance =
      pickup.latitude !== null && pickup.longitude !== null && agent.latitude !== null && agent.longitude !== null
        ? Math.round(
            haversineKm(
              { lat: pickup.latitude, lng: pickup.longitude },
              { lat: agent.latitude, lng: agent.longitude },
            ) * 100,
          ) / 100
        : null;
    selection = {
      agentId: agent.id,
      method: AssignmentMethod.MANUAL,
      distanceKm: distance,
      reason: `Manually assigned to ${agent.user.name} by ${opts.actor.name}`,
    };
  } else {
    const candidates = await loadCandidates();
    const picked = selectAgent(candidates, {
      lat: pickup.latitude,
      lng: pickup.longitude,
      zoneId: order.pickupZoneId,
    });
    if (!picked) throw conflict('No available agent could be found for automatic assignment');
    selection = picked;
  }

  const attempt = order.attempts[0];

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.agentAssignment.updateMany({
      where: { orderId: order.id, isActive: true },
      data: { isActive: false, releasedAt: new Date() },
    });
    await tx.agentAssignment.create({
      data: {
        orderId: order.id,
        agentId: selection.agentId,
        attemptId: attempt?.id,
        method: selection.method,
        assignedById: opts.actor.id,
        distanceKm: selection.distanceKm,
        reason: selection.reason,
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { currentAgentId: selection.agentId, status: OrderStatus.ASSIGNED },
    });
    if (attempt) {
      await tx.deliveryAttempt.update({
        where: { id: attempt.id },
        data: { agentId: selection.agentId },
      });
    }
    await recordStatusChange(tx, {
      orderId: order.id,
      attemptId: attempt?.id,
      previousStatus: order.status,
      newStatus: OrderStatus.ASSIGNED,
      actor: opts.actor,
      note: selection.reason,
    });
  });

  await notifyStatusChange(order.id, OrderStatus.ASSIGNED, selection.reason);

  const assignment = await prisma.agentAssignment.findFirst({
    where: { orderId: order.id, isActive: true },
    include: { agent: { include: { user: true } } },
  });
  return { selection, assignment };
}

/** Detaches the current agent from an order (used on failure and reschedule). */
export async function releaseAgent(tx: Prisma.TransactionClient, orderId: string) {
  await tx.agentAssignment.updateMany({
    where: { orderId, isActive: true },
    data: { isActive: false, releasedAt: new Date() },
  });
  await tx.order.update({ where: { id: orderId }, data: { currentAgentId: null } });
}
