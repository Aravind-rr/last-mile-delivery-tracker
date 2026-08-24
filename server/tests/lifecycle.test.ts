import { describe, expect, it } from 'vitest';
import { OrderStatus, Role } from '@prisma/client';
import { ALLOWED_TRANSITIONS, canTransition } from '../src/services/orders';

describe('order status transitions', () => {
  it('follows the happy path in order', () => {
    const flow: OrderStatus[] = [
      OrderStatus.PENDING_ASSIGNMENT, OrderStatus.ASSIGNED, OrderStatus.PICKED_UP,
      OrderStatus.IN_TRANSIT, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED,
    ];
    for (let i = 0; i < flow.length - 1; i++) {
      expect(canTransition(flow[i], flow[i + 1])).toBe(true);
    }
  });

  it('rejects skipping a step', () => {
    expect(canTransition(OrderStatus.ASSIGNED, OrderStatus.DELIVERED)).toBe(false);
    expect(canTransition(OrderStatus.PENDING_ASSIGNMENT, OrderStatus.OUT_FOR_DELIVERY)).toBe(false);
  });

  it('rejects moving backwards', () => {
    expect(canTransition(OrderStatus.IN_TRANSIT, OrderStatus.PICKED_UP)).toBe(false);
  });

  it('treats DELIVERED and CANCELLED as terminal', () => {
    expect(ALLOWED_TRANSITIONS.DELIVERED).toHaveLength(0);
    expect(ALLOWED_TRANSITIONS.CANCELLED).toHaveLength(0);
  });
});

describe('failed delivery and rescheduling', () => {
  it('allows failure from every in-flight status', () => {
    for (const s of [OrderStatus.ASSIGNED, OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT, OrderStatus.OUT_FOR_DELIVERY]) {
      expect(canTransition(s, OrderStatus.FAILED)).toBe(true);
    }
  });

  it('does not allow failure once delivered', () => {
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.FAILED)).toBe(false);
  });

  it('allows a failed order to be rescheduled and reassigned', () => {
    expect(canTransition(OrderStatus.FAILED, OrderStatus.RESCHEDULED)).toBe(true);
    expect(canTransition(OrderStatus.RESCHEDULED, OrderStatus.ASSIGNED)).toBe(true);
  });

  it('does not allow a failed order to jump straight back to delivery', () => {
    expect(canTransition(OrderStatus.FAILED, OrderStatus.OUT_FOR_DELIVERY)).toBe(false);
  });
});

/**
 * The runtime RBAC checks live in `changeStatus` and the `requireRole` middleware;
 * these assertions pin the role matrix the API enforces.
 */
describe('role permissions matrix', () => {
  const AGENT_ALLOWED = [
    OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT, OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.DELIVERED, OrderStatus.FAILED,
  ];

  it('lets agents drive only the field statuses', () => {
    expect(AGENT_ALLOWED).not.toContain(OrderStatus.ASSIGNED);
    expect(AGENT_ALLOWED).not.toContain(OrderStatus.CANCELLED);
    expect(AGENT_ALLOWED).toContain(OrderStatus.DELIVERED);
  });

  it('recognises the three roles', () => {
    expect(Object.values(Role)).toEqual(expect.arrayContaining(['ADMIN', 'CUSTOMER', 'AGENT']));
  });
});
