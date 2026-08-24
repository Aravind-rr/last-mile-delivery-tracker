export type Role = 'ADMIN' | 'CUSTOMER' | 'AGENT';
export type AgentStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE';
export type ServiceType = 'B2B' | 'B2C';
export type PaymentType = 'PREPAID' | 'COD';
export type ZoneScope = 'INTRA_ZONE' | 'INTER_ZONE';
export type OrderStatus =
  | 'PENDING_ASSIGNMENT' | 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED' | 'RESCHEDULED' | 'CANCELLED';

export interface User {
  id: string; name: string; email: string; phone: string | null; role: Role;
  agentProfile?: AgentProfile | null;
}

export interface Zone {
  id: string; code: string; name: string; city: string;
  centerLat: number | null; centerLng: number | null; isActive: boolean;
  areas?: ZoneArea[]; _count?: { agents: number };
}
export interface ZoneArea { id: string; zoneId: string; postalCode: string; areaName: string }

export interface AgentProfile {
  id: string; userId: string; status: AgentStatus; vehicleType: string;
  maxActiveOrders: number; latitude: number | null; longitude: number | null;
  locationUpdatedAt: string | null; baseZoneId: string | null;
  baseZone?: Zone | null; user?: { id: string; name: string; email: string; phone: string | null };
  _count?: { currentOrders: number };
}

export interface RateRule {
  id: string; rateCardId: string; scope: ZoneScope; baseCharge: number;
  includedWeightKg: number; perKgCharge: number; minCharge: number;
}
export interface RateCard {
  id: string; name: string; serviceType: ServiceType; currency: string;
  volumetricDivisor: number; fuelSurchargePercent: number; taxPercent: number;
  isActive: boolean; rules: RateRule[];
}
export interface CodSurcharge {
  id: string; serviceType: ServiceType; mode: 'FLAT' | 'PERCENT_OF_VALUE' | 'HIGHER_OF_BOTH';
  flatAmount: number; percentOfValue: number; minAmount: number; isActive: boolean;
}

export interface PriceLine { label: string; amount: number; detail: string }
export interface Quote {
  currency: string; rateCardId: string; rateCardName: string;
  serviceType: ServiceType; paymentType: PaymentType; zoneScope: ZoneScope;
  pickupZone: { id: string; code: string; name: string };
  dropZone: { id: string; code: string; name: string };
  volumetricDivisor: number; volumetricWeightKg: number; actualWeightKg: number;
  billableWeightKg: number; billableWeightSource: 'ACTUAL' | 'VOLUMETRIC';
  chargeableWeightKg: number; baseCharge: number; weightCharge: number;
  fuelSurcharge: number; codCharge: number; taxAmount: number; totalPrice: number;
  lines: PriceLine[];
}

export interface OrderAddress {
  id: string; kind: 'PICKUP' | 'DROP'; contactName: string; contactPhone: string;
  line1: string; line2: string | null; city: string; state: string; postalCode: string;
  latitude: number | null; longitude: number | null; zone?: Zone;
}
export interface StatusHistory {
  id: string; previousStatus: OrderStatus | null; newStatus: OrderStatus;
  actorLabel: string; note: string | null; createdAt: string;
}
export interface DeliveryAttempt {
  id: string; attemptNumber: number; status: string; scheduledFor: string | null;
  startedAt: string | null; completedAt: string | null; failureReason: string | null;
  notes: string | null; agent?: { user: { name: string } } | null;
}
export interface AgentAssignment {
  id: string; method: string; distanceKm: number | null; reason: string | null;
  isActive: boolean; assignedAt: string; releasedAt: string | null;
  agent?: { user: { name: string } }; assignedBy?: { name: string; role: Role } | null;
}
export interface Order {
  id: string; code: string; status: OrderStatus; serviceType: ServiceType;
  paymentType: PaymentType; zoneScope: ZoneScope;
  lengthCm: number; breadthCm: number; heightCm: number;
  actualWeightKg: number; volumetricWeightKg: number; billableWeightKg: number;
  declaredValue: number; baseCharge: number; weightCharge: number;
  fuelSurcharge: number; codCharge: number; taxAmount: number; totalPrice: number;
  priceBreakdown: Quote; scheduledDate: string | null; deliveredAt: string | null;
  notes: string | null; createdAt: string; updatedAt: string;
  customer: { id: string; name: string; email: string; phone: string | null };
  createdBy?: { id: string; name: string; role: Role };
  pickupZone: Zone; dropZone: Zone; rateCard?: RateCard;
  addresses: OrderAddress[];
  currentAgentId: string | null;
  currentAgent?: { id: string; user: { id: string; name: string; phone: string | null } } | null;
  attempts: DeliveryAttempt[];
  assignments: AgentAssignment[];
  statusHistory: StatusHistory[];
}

export interface AdminStats {
  totalOrders: number; revenue: number;
  ordersByStatus: Partial<Record<OrderStatus, number>>;
  agentsByStatus: Partial<Record<AgentStatus, number>>;
  pendingAssignment: number;
  recentOrders: Order[];
}
export interface NotificationRow {
  id: string; channel: 'EMAIL' | 'SMS'; event: string; recipient: string;
  subject: string; body: string; status: string; createdAt: string;
  order?: { code: string } | null;
}
