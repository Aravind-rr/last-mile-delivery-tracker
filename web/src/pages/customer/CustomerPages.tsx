import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import type { Order } from '../../lib/types';
import { day, dt, inr, titleize } from '../../lib/format';
import { Alert, Empty, Field, Modal, SectionTitle, Spinner, StatCard, StatusBadge } from '../../components/ui';
import { OrderTable } from '../../components/OrderTable';
import { Timeline } from '../../components/Timeline';
import { PriceBreakdown } from '../../components/PriceBreakdown';
import { useAuth } from '../../context/AuthContext';

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      const { data } = await api.get<Order[]>('/orders');
      setOrders(data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  return { orders, loading, error, reload: load };
}

export function CustomerDashboard() {
  const { user } = useAuth();
  const { orders, loading } = useOrders();
  const stats = useMemo(() => {
    const active = orders.filter((o) => !['DELIVERED', 'CANCELLED'].includes(o.status));
    return {
      total: orders.length,
      active: active.length,
      delivered: orders.filter((o) => o.status === 'DELIVERED').length,
      failed: orders.filter((o) => o.status === 'FAILED').length,
      spend: orders.reduce((s, o) => s + o.totalPrice, 0),
    };
  }, [orders]);

  if (loading) return <Spinner />;

  return (
    <div>
      <SectionTitle
        title={`Welcome back, ${user?.name.split(' ')[0]}`}
        subtitle="Track your shipments and book new deliveries."
        action={<Link to="/customer/new" className="btn-primary">＋ New delivery</Link>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total orders" value={stats.total} />
        <StatCard label="In progress" value={stats.active} />
        <StatCard label="Delivered" value={stats.delivered} />
        <StatCard label="Total spend" value={inr(stats.spend)} />
      </div>

      {stats.failed > 0 && (
        <div className="mt-5">
          <Alert kind="error">
            {stats.failed} delivery {stats.failed === 1 ? 'attempt' : 'attempts'} failed and can be rescheduled from your orders list.
          </Alert>
        </div>
      )}

      <h2 className="mb-3 mt-8 font-semibold text-slate-900">Recent orders</h2>
      <OrderTable orders={orders.slice(0, 8)} basePath="/customer/orders" showAgent />
    </div>
  );
}

export function CustomerOrders() {
  const { orders, loading } = useOrders();
  const [status, setStatus] = useState('');
  const filtered = status ? orders.filter((o) => o.status === status) : orders;
  if (loading) return <Spinner />;
  return (
    <div>
      <SectionTitle title="My orders" subtitle="Every shipment you have booked."
        action={<Link to="/customer/new" className="btn-primary">＋ New delivery</Link>} />
      <div className="card card-pad mb-4 flex flex-wrap items-end gap-4">
        <div className="w-56">
          <Field label="Filter by status">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {['PENDING_ASSIGNMENT', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RESCHEDULED'].map((s) => (
                <option key={s} value={s}>{titleize(s)}</option>
              ))}
            </select>
          </Field>
        </div>
        <p className="pb-2 text-sm text-slate-500">{filtered.length} of {orders.length} orders</p>
      </div>
      <OrderTable orders={filtered} basePath="/customer/orders" showAgent />
    </div>
  );
}

export function CustomerOrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get<Order>(`/orders/${id}`);
      setOrder(data);
    } catch (err) { setError(apiError(err)); }
  };
  useEffect(() => { void load(); }, [id]);

  const reschedule = async () => {
    setBusy(true); setError('');
    try {
      await api.post(`/orders/${id}/reschedule`, { scheduledDate: new Date(date).toISOString(), note: note || undefined });
      setOpen(false); setNote('');
      await load();
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  if (error && !order) return <Alert>{error}</Alert>;
  if (!order) return <Spinner />;

  const failedAttempts = order.attempts.filter((a) => a.status === 'FAILED');
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl">
      <SectionTitle
        title={`Order ${order.code}`}
        subtitle={`Booked ${dt(order.createdAt)} · ${order.serviceType} · ${titleize(order.paymentType)}`}
        action={
          order.status === 'FAILED' ? (
            <button className="btn-primary" onClick={() => { setDate(tomorrow); setOpen(true); }}>Reschedule delivery</button>
          ) : <StatusBadge status={order.status} />
        }
      />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="card card-pad">
            <h3 className="mb-4 font-semibold text-slate-900">Tracking timeline</h3>
            <Timeline events={order.statusHistory} />
          </div>

          <div className="card card-pad">
            <h3 className="mb-4 font-semibold text-slate-900">Delivery attempts</h3>
            <div className="space-y-3">
              {order.attempts.map((a) => (
                <div key={a.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800">Attempt #{a.attemptNumber}</p>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titleize(a.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Scheduled {day(a.scheduledFor)} · Agent {a.agent?.user.name ?? '—'}
                  </p>
                  {a.failureReason && <p className="mt-2 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">Failed: {a.failureReason}</p>}
                  {a.notes && <p className="mt-2 text-sm text-slate-600">{a.notes}</p>}
                </div>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <h3 className="mb-4 font-semibold text-slate-900">Price breakdown</h3>
            <PriceBreakdown quote={order.priceBreakdown} />
          </div>
        </div>

        <div className="space-y-5">
          <div className="card card-pad">
            <h3 className="mb-3 font-semibold text-slate-900">Shipment</h3>
            <dl className="space-y-2 text-sm">
              <Row k="Status" v={<StatusBadge status={order.status} />} />
              <Row k="Lane" v={`${order.pickupZone.code} → ${order.dropZone.code} (${order.zoneScope === 'INTRA_ZONE' ? 'intra-zone' : 'inter-zone'})`} />
              <Row k="Dimensions" v={`${order.lengthCm}×${order.breadthCm}×${order.heightCm} cm`} />
              <Row k="Actual weight" v={`${order.actualWeightKg} kg`} />
              <Row k="Volumetric" v={`${order.volumetricWeightKg} kg`} />
              <Row k="Billable" v={`${order.billableWeightKg} kg`} />
              <Row k="Total" v={<span className="font-bold">{inr(order.totalPrice)}</span>} />
              {order.currentAgent && <Row k="Agent" v={order.currentAgent.user.name} />}
              {order.scheduledDate && <Row k="Rescheduled for" v={day(order.scheduledDate)} />}
            </dl>
          </div>

          {order.addresses.map((a) => (
            <div key={a.id} className="card card-pad">
              <h3 className="mb-2 font-semibold text-slate-900">{titleize(a.kind)} address</h3>
              <p className="text-sm text-slate-600">
                {a.contactName} · {a.contactPhone}<br />
                {a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />
                {a.city}, {a.state} {a.postalCode}
              </p>
            </div>
          ))}
        </div>
      </div>

      <Modal open={open} title="Reschedule failed delivery" onClose={() => setOpen(false)}>
        <div className="space-y-4">
          {failedAttempts.length > 0 && (
            <Alert kind="info">
              Last failure: {failedAttempts[failedAttempts.length - 1].failureReason}
            </Alert>
          )}
          <Field label="New delivery date" hint="A new delivery attempt is created; previous attempts are preserved.">
            <input className="input" type="date" min={tomorrow} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Note for the agent (optional)">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Please call before arriving" />
          </Field>
          <button className="btn-primary w-full" onClick={reschedule} disabled={busy || !date}>
            {busy ? 'Rescheduling…' : 'Confirm reschedule'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2 last:border-0">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right font-medium text-slate-800">{v}</dd>
    </div>
  );
}

export { Empty };
