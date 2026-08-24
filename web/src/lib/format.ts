import type { OrderStatus } from './types';

export const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

export const dt = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const day = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—';

export const titleize = (s: string) =>
  s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export const STATUS_FLOW: OrderStatus[] = [
  'PENDING_ASSIGNMENT', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED',
];

export const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING_ASSIGNMENT: 'bg-amber-100 text-amber-800 ring-amber-200',
  ASSIGNED: 'bg-sky-100 text-sky-800 ring-sky-200',
  PICKED_UP: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  IN_TRANSIT: 'bg-violet-100 text-violet-800 ring-violet-200',
  OUT_FOR_DELIVERY: 'bg-blue-100 text-blue-800 ring-blue-200',
  DELIVERED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  FAILED: 'bg-rose-100 text-rose-800 ring-rose-200',
  RESCHEDULED: 'bg-orange-100 text-orange-800 ring-orange-200',
  CANCELLED: 'bg-slate-200 text-slate-700 ring-slate-300',
};

/** Next status an agent may set from the current one. */
export const AGENT_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  ASSIGNED: 'PICKED_UP',
  PICKED_UP: 'IN_TRANSIT',
  IN_TRANSIT: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'DELIVERED',
};
