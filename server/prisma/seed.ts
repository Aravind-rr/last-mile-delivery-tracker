import bcrypt from 'bcryptjs';
import {
  AgentStatus,
  CodMode,
  OrderStatus,
  PaymentType,
  Role,
  ServiceType,
  ZoneScope,
} from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { createOrder } from '../src/services/orders';
import { changeStatus } from '../src/services/orders';
import { assignAgent } from '../src/services/assignment';

const PASSWORD = 'Password@123';

async function reset() {
  await prisma.notification.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.agentAssignment.deleteMany();
  await prisma.deliveryAttempt.deleteMany();
  await prisma.orderAddress.deleteMany();
  await prisma.order.deleteMany();
  await prisma.rateRule.deleteMany();
  await prisma.rateCard.deleteMany();
  await prisma.codSurcharge.deleteMany();
  await prisma.zoneArea.deleteMany();
  await prisma.agentProfile.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  await reset();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // ----------------------------------------------------------------- zones
  const zoneSeed = [
    { code: 'BLR-N', name: 'Bengaluru North', city: 'Bengaluru', centerLat: 13.0359, centerLng: 77.597,
      areas: [['560001', 'Bengaluru GPO'], ['560003', 'Malleswaram'], ['560024', 'Hebbal'], ['560064', 'Yelahanka']] },
    { code: 'BLR-S', name: 'Bengaluru South', city: 'Bengaluru', centerLat: 12.9081, centerLng: 77.6476,
      areas: [['560029', 'Jayanagar'], ['560034', 'Koramangala'], ['560076', 'BTM Layout'], ['560102', 'HSR Layout']] },
    { code: 'BLR-E', name: 'Bengaluru East', city: 'Bengaluru', centerLat: 12.9784, centerLng: 77.7089,
      areas: [['560037', 'Marathahalli'], ['560048', 'Whitefield'], ['560066', 'ITPL'], ['560093', 'Indiranagar East']] },
  ];

  const zones: Record<string, string> = {};
  for (const z of zoneSeed) {
    const zone = await prisma.zone.create({
      data: {
        code: z.code, name: z.name, city: z.city, centerLat: z.centerLat, centerLng: z.centerLng,
        areas: { create: z.areas.map(([postalCode, areaName]) => ({ postalCode, areaName })) },
      },
    });
    zones[z.code] = zone.id;
  }

  // ------------------------------------------------------------- rate cards
  const b2c = await prisma.rateCard.create({
    data: {
      name: 'B2C Standard 2026', serviceType: ServiceType.B2C, volumetricDivisor: 5000,
      fuelSurchargePercent: 6, taxPercent: 18,
      rules: {
        create: [
          { scope: ZoneScope.INTRA_ZONE, baseCharge: 45, includedWeightKg: 1, perKgCharge: 18, minCharge: 45 },
          { scope: ZoneScope.INTER_ZONE, baseCharge: 75, includedWeightKg: 1, perKgCharge: 28, minCharge: 75 },
        ],
      },
    },
  });
  const b2b = await prisma.rateCard.create({
    data: {
      name: 'B2B Contract 2026', serviceType: ServiceType.B2B, volumetricDivisor: 5000,
      fuelSurchargePercent: 8, taxPercent: 18,
      rules: {
        create: [
          { scope: ZoneScope.INTRA_ZONE, baseCharge: 90, includedWeightKg: 5, perKgCharge: 14, minCharge: 90 },
          { scope: ZoneScope.INTER_ZONE, baseCharge: 140, includedWeightKg: 5, perKgCharge: 22, minCharge: 140 },
        ],
      },
    },
  });
  console.log(`rate cards: ${b2c.name}, ${b2b.name}`);

  await prisma.codSurcharge.createMany({
    data: [
      { serviceType: ServiceType.B2C, mode: CodMode.HIGHER_OF_BOTH, flatAmount: 35, percentOfValue: 1.5, minAmount: 35 },
      { serviceType: ServiceType.B2B, mode: CodMode.HIGHER_OF_BOTH, flatAmount: 60, percentOfValue: 1, minAmount: 60 },
    ],
  });

  // ----------------------------------------------------------------- users
  const admin = await prisma.user.create({
    data: { name: 'Asha Admin', email: 'admin@lmdt.dev', phone: '+91 90000 00001', role: Role.ADMIN, passwordHash },
  });

  const customers = await Promise.all(
    [
      { name: 'Ravi Kumar', email: 'ravi@customer.dev', phone: '+91 90000 10001' },
      { name: 'Meera Nair', email: 'meera@customer.dev', phone: '+91 90000 10002' },
    ].map((c) => prisma.user.create({ data: { ...c, role: Role.CUSTOMER, passwordHash } })),
  );

  const agentSeed = [
    { name: 'Arjun Rao', email: 'arjun@agent.dev', zone: 'BLR-N', lat: 13.0298, lng: 77.5936, status: AgentStatus.AVAILABLE, vehicle: 'BIKE' },
    { name: 'Divya Shetty', email: 'divya@agent.dev', zone: 'BLR-S', lat: 12.9352, lng: 77.6245, status: AgentStatus.AVAILABLE, vehicle: 'BIKE' },
    { name: 'Karan Mehta', email: 'karan@agent.dev', zone: 'BLR-E', lat: 12.9698, lng: 77.7499, status: AgentStatus.AVAILABLE, vehicle: 'VAN' },
    { name: 'Priya Iyer', email: 'priya@agent.dev', zone: 'BLR-S', lat: 12.9121, lng: 77.6446, status: AgentStatus.BUSY, vehicle: 'BIKE' },
    { name: 'Sanjay Gowda', email: 'sanjay@agent.dev', zone: 'BLR-N', lat: 13.0827, lng: 77.5877, status: AgentStatus.OFFLINE, vehicle: 'MINI_TRUCK' },
  ];

  for (const [i, a] of agentSeed.entries()) {
    await prisma.user.create({
      data: {
        name: a.name, email: a.email, phone: `+91 90000 2000${i + 1}`, role: Role.AGENT, passwordHash,
        agentProfile: {
          create: {
            status: a.status, vehicleType: a.vehicle, latitude: a.lat, longitude: a.lng,
            locationUpdatedAt: new Date(), baseZoneId: zones[a.zone], maxActiveOrders: 5,
          },
        },
      },
    });
  }

  const adminActor = { id: admin.id, name: admin.name, role: Role.ADMIN };

  // ---------------------------------------------------------- sample orders
  const mk = (
    customerIdx: number,
    serviceType: ServiceType,
    paymentType: PaymentType,
    pickupPc: string,
    dropPc: string,
    dims: [number, number, number],
    weight: number,
    value = 0,
  ) => ({
    customerId: customers[customerIdx].id,
    serviceType, paymentType,
    lengthCm: dims[0], breadthCm: dims[1], heightCm: dims[2],
    actualWeightKg: weight, declaredValue: value,
    pickup: {
      contactName: 'Warehouse Desk', contactPhone: '+91 98800 11111',
      line1: 'Unit 4, Logistics Park', city: 'Bengaluru', state: 'Karnataka',
      postalCode: pickupPc, latitude: 12.9716 + Math.random() * 0.06, longitude: 77.5946 + Math.random() * 0.09,
    },
    drop: {
      contactName: customers[customerIdx].name, contactPhone: customers[customerIdx].phone ?? '+91 98800 22222',
      line1: 'Flat 302, Green Residency', city: 'Bengaluru', state: 'Karnataka',
      postalCode: dropPc, latitude: 12.9716 + Math.random() * 0.06, longitude: 77.5946 + Math.random() * 0.09,
    },
  });

  // 1. Delivered (full happy path)
  const o1 = await createOrder(mk(0, ServiceType.B2C, PaymentType.PREPAID, '560001', '560003', [30, 20, 15], 2.5), adminActor);
  await assignAgent({ orderId: o1.id, actor: adminActor });
  const agentActor = async (orderId: string) => {
    const o = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { currentAgent: { include: { user: true } } },
    });
    return {
      actor: { id: o.currentAgent!.user.id, name: o.currentAgent!.user.name, role: Role.AGENT },
      agentProfileId: o.currentAgentId,
    };
  };
  {
    const a = await agentActor(o1.id);
    for (const s of [OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED]) {
      await changeStatus({ orderId: o1.id, newStatus: s, actor: a.actor, agentProfileId: a.agentProfileId, note: 'Seed data' });
    }
  }

  // 2. Out for delivery (COD, inter-zone, B2C)
  const o2 = await createOrder(mk(0, ServiceType.B2C, PaymentType.COD, '560034', '560048', [40, 30, 25], 4, 4500), adminActor);
  await assignAgent({ orderId: o2.id, actor: adminActor });
  {
    const a = await agentActor(o2.id);
    for (const s of [OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT, OrderStatus.OUT_FOR_DELIVERY]) {
      await changeStatus({ orderId: o2.id, newStatus: s, actor: a.actor, agentProfileId: a.agentProfileId, note: 'Seed data' });
    }
  }

  // 3. Failed delivery awaiting reschedule (B2B inter-zone)
  const o3 = await createOrder(mk(1, ServiceType.B2B, PaymentType.PREPAID, '560064', '560102', [60, 50, 40], 12), adminActor);
  await assignAgent({ orderId: o3.id, actor: adminActor });
  {
    const a = await agentActor(o3.id);
    await changeStatus({ orderId: o3.id, newStatus: OrderStatus.PICKED_UP, actor: a.actor, agentProfileId: a.agentProfileId });
    await changeStatus({ orderId: o3.id, newStatus: OrderStatus.IN_TRANSIT, actor: a.actor, agentProfileId: a.agentProfileId });
    await changeStatus({ orderId: o3.id, newStatus: OrderStatus.OUT_FOR_DELIVERY, actor: a.actor, agentProfileId: a.agentProfileId });
    await changeStatus({
      orderId: o3.id, newStatus: OrderStatus.FAILED, actor: a.actor, agentProfileId: a.agentProfileId,
      failureReason: 'Consignee premises closed on arrival',
    });
  }

  // 4. Assigned, in transit (B2B intra-zone, COD)
  const o4 = await createOrder(mk(1, ServiceType.B2B, PaymentType.COD, '560037', '560066', [25, 25, 20], 6, 22000), adminActor);
  await assignAgent({ orderId: o4.id, actor: adminActor });
  {
    const a = await agentActor(o4.id);
    await changeStatus({ orderId: o4.id, newStatus: OrderStatus.PICKED_UP, actor: a.actor, agentProfileId: a.agentProfileId });
    await changeStatus({ orderId: o4.id, newStatus: OrderStatus.IN_TRANSIT, actor: a.actor, agentProfileId: a.agentProfileId });
  }

  // 5 & 6. Awaiting assignment
  await createOrder(mk(0, ServiceType.B2C, PaymentType.PREPAID, '560076', '560029', [15, 10, 10], 0.8), adminActor);
  await createOrder(mk(1, ServiceType.B2C, PaymentType.COD, '560093', '560024', [50, 40, 30], 3, 1800), adminActor);

  console.log('\nSeed complete.');
  console.log(`  admin     admin@lmdt.dev / ${PASSWORD}`);
  console.log(`  customers ${customers.map((c) => c.email).join(', ')} / ${PASSWORD}`);
  console.log(`  agents    ${agentSeed.map((a) => a.email).join(', ')} / ${PASSWORD}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
