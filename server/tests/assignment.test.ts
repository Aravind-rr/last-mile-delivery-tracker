import { describe, expect, it } from 'vitest';
import { AgentStatus } from '@prisma/client';
import { haversineKm, selectAgent, type CandidateAgent } from '../src/services/assignment';

const agent = (over: Partial<CandidateAgent> & { id: string }): CandidateAgent => ({
  name: `Agent ${over.id}`,
  status: AgentStatus.AVAILABLE,
  latitude: null,
  longitude: null,
  baseZoneId: null,
  activeOrders: 0,
  maxActiveOrders: 5,
  ...over,
});

const pickup = { lat: 12.9716, lng: 77.5946, zoneId: 'zone-south' };

describe('haversine distance', () => {
  it('is zero for the same point', () => {
    expect(haversineKm({ lat: 12.97, lng: 77.59 }, { lat: 12.97, lng: 77.59 })).toBe(0);
  });
  it('is roughly correct for a known short hop', () => {
    const d = haversineKm({ lat: 12.9716, lng: 77.5946 }, { lat: 13.0359, lng: 77.597 });
    expect(d).toBeGreaterThan(6);
    expect(d).toBeLessThan(9);
  });
});

describe('nearest-agent selection', () => {
  it('picks the closest available agent when coordinates exist', () => {
    const result = selectAgent(
      [
        agent({ id: 'far', latitude: 13.2, longitude: 77.9 }),
        agent({ id: 'near', latitude: 12.975, longitude: 77.60 }),
      ],
      pickup,
    );
    expect(result?.agentId).toBe('near');
    expect(result?.method).toBe('AUTO_NEAREST_COORDINATES');
    expect(result?.distanceKm).toBeGreaterThan(0);
  });

  it('never selects a BUSY or OFFLINE agent', () => {
    const result = selectAgent(
      [
        agent({ id: 'busy', status: AgentStatus.BUSY, latitude: 12.9716, longitude: 77.5946 }),
        agent({ id: 'offline', status: AgentStatus.OFFLINE, latitude: 12.9716, longitude: 77.5946 }),
        agent({ id: 'free', latitude: 13.2, longitude: 77.9 }),
      ],
      pickup,
    );
    expect(result?.agentId).toBe('free');
  });

  it('skips agents that are already at capacity', () => {
    const result = selectAgent(
      [
        agent({ id: 'loaded', latitude: 12.9716, longitude: 77.5946, activeOrders: 5, maxActiveOrders: 5 }),
        agent({ id: 'spare', latitude: 13.1, longitude: 77.7 }),
      ],
      pickup,
    );
    expect(result?.agentId).toBe('spare');
  });

  it('falls back to the pickup zone when no coordinates are available', () => {
    const result = selectAgent(
      [agent({ id: 'other-zone', baseZoneId: 'zone-north' }), agent({ id: 'same-zone', baseZoneId: 'zone-south' })],
      { lat: null, lng: null, zoneId: 'zone-south' },
    );
    expect(result?.agentId).toBe('same-zone');
    expect(result?.method).toBe('AUTO_PICKUP_ZONE');
  });

  it('breaks ties deterministically by load then id', () => {
    const candidates = [
      agent({ id: 'b', baseZoneId: 'zone-south', activeOrders: 2 }),
      agent({ id: 'a', baseZoneId: 'zone-south', activeOrders: 1 }),
      agent({ id: 'c', baseZoneId: 'zone-south', activeOrders: 1 }),
    ];
    const first = selectAgent(candidates, { lat: null, lng: null, zoneId: 'zone-south' });
    const second = selectAgent([...candidates].reverse(), { lat: null, lng: null, zoneId: 'zone-south' });
    expect(first?.agentId).toBe('a');
    expect(second?.agentId).toBe('a');
  });

  it('returns null when nobody is available', () => {
    expect(selectAgent([agent({ id: 'x', status: AgentStatus.OFFLINE })], pickup)).toBeNull();
    expect(selectAgent([], pickup)).toBeNull();
  });
});
