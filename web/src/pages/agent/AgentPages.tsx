import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import type { AgentProfile, AgentStatus, Order, OrderStatus } from '../../lib/types';
import { AGENT_NEXT, day, dt, inr, titleize } from '../../lib/format';
import { AgentBadge, Alert, Empty, Field, Modal, SectionTitle, Spinner, StatCard, StatusBadge } from '../../components/ui';
import { Timeline } from '../../components/Timeline';

function useAgent() {
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, o] = await Promise.all([api.get<AgentProfile>('/agents/me'), api.get<Order[]>('/agents/me/orders')]);
      setProfile(p.data);
      setOrders(o.data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  return { profile, orders, loading, error, reload: load, setError };
}

export function AgentDashboard() {
  const { profile, orders, loading, error, reload, setError } = useAgent();
  const [busy, setBusy] = useState(false);
  const [coords, setCoords] = useState({ lat: '', lng: '' });

  useEffect(() => {
    if (profile) setCoords({ lat: String(profile.latitude ?? ''), lng: String(profile.longitude ?? '') });
  }, [profile]);

  const setStatus = async (status: AgentStatus) => {
    setBusy(true);
    try { await api.patch('/agents/me/availability', { status }); await reload(); }
    catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  const saveLocation = async () => {
    setBusy(true);
    try {
      await api.patch('/agents/me/location', { latitude: Number(coords.lat), longitude: Number(coords.lng) });
      await reload();
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  const useBrowserLocation = () => {
    navigator.geolocation?.getCurrentPosition((p) =>
      setCoords({ lat: p.coords.latitude.toFixed(5), lng: p.coords.longitude.toFixed(5) }));
  };

  if (loading) return <Spinner />;
  if (!profile) return <Alert>{error || 'No agent profile found'}</Alert>;

  const active = orders.filter((o) => !['DELIVERED', 'FAILED', 'CANCELLED'].includes(o.status));

  return (
    <div>
      <SectionTitle title={`Hello, ${profile.user?.name.split(' ')[0]}`} subtitle="Manage your availability, location and assigned deliveries."
        action={<AgentBadge status={profile.status} />} />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active deliveries" value={active.length} hint={`Capacity ${profile.maxActiveOrders}`} />
        <StatCard label="Out for delivery" value={orders.filter((o) => o.status === 'OUT_FOR_DELIVERY').length} />
        <StatCard label="Base zone" value={profile.baseZone?.code ?? '—'} hint={profile.baseZone?.name} />
        <StatCard label="Vehicle" value={titleize(profile.vehicleType)} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="card card-pad">
          <h3 className="font-semibold text-slate-900">Availability</h3>
          <p className="mt-1 text-sm text-slate-500">Only <strong>Available</strong> agents are picked up by auto-assignment.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(['AVAILABLE', 'BUSY', 'OFFLINE'] as AgentStatus[]).map((s) => (
              <button key={s} disabled={busy} onClick={() => setStatus(s)}
                className={profile.status === s ? 'btn-primary' : 'btn-ghost'}>
                {titleize(s)}
              </button>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <h3 className="font-semibold text-slate-900">Current location</h3>
          <p className="mt-1 text-sm text-slate-500">
            Last updated {profile.locationUpdatedAt ? dt(profile.locationUpdatedAt) : 'never'} · used for nearest-agent assignment.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Latitude"><input className="input" value={coords.lat} onChange={(e) => setCoords({ ...coords, lat: e.target.value })} /></Field>
            <Field label="Longitude"><input className="input" value={coords.lng} onChange={(e) => setCoords({ ...coords, lng: e.target.value })} /></Field>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary" onClick={saveLocation} disabled={busy}>Update location</button>
            <button className="btn-ghost" onClick={useBrowserLocation}>Use device GPS</button>
          </div>
        </div>
      </div>

      <h2 className="mb-3 mt-8 font-semibold text-slate-900">Assigned orders</h2>
      <AgentOrderList orders={orders} />
    </div>
  );
}

export function AgentOrders() {
  const { orders, loading } = useAgent();
  if (loading) return <Spinner />;
  return (
    <div>
      <SectionTitle title="Assigned orders" subtitle="Every shipment currently in your hands." />
      <AgentOrderList orders={orders} />
    </div>
  );
}

function AgentOrderList({ orders }: { orders: Order[] }) {
  if (orders.length === 0) return <Empty title="Nothing assigned right now" hint="Set yourself Available so the dispatcher can route orders to you." />;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {orders.map((o) => {
        const drop = o.addresses.find((a) => a.kind === 'DROP');
        return (
          <Link key={o.id} to={`/agent/orders/${o.id}`} className="card card-pad transition hover:border-brand-300 hover:shadow-md">
            <div className="flex items-center justify-between">
              <p className="font-bold text-brand-700">{o.code}</p>
              <StatusBadge status={o.status} />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-800">{drop?.contactName}</p>
            <p className="text-sm text-slate-500">{drop?.line1}, {drop?.city} {drop?.postalCode}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
              <span>{o.billableWeightKg} kg billable</span>
              <span>{o.serviceType}</span>
              <span className={o.paymentType === 'COD' ? 'font-semibold text-amber-700' : ''}>
                {o.paymentType === 'COD' ? `Collect ${inr(o.declaredValue)}` : 'Prepaid'}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export function AgentOrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try { const { data } = await api.get<Order>(`/orders/${id}`); setOrder(data); }
    catch (err) { setError(apiError(err)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const advance = async (status: OrderStatus, extra?: Record<string, unknown>) => {
    setBusy(true); setError('');
    try {
      await api.patch(`/orders/${id}/status`, { status, ...extra });
      setFailOpen(false); setReason('');
      await load();
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  if (error && !order) return <Alert>{error}</Alert>;
  if (!order) return <Spinner />;

  const next = AGENT_NEXT[order.status];
  const pickup = order.addresses.find((a) => a.kind === 'PICKUP');
  const drop = order.addresses.find((a) => a.kind === 'DROP');
  const terminal = ['DELIVERED', 'FAILED', 'RESCHEDULED', 'CANCELLED'].includes(order.status);

  return (
    <div className="mx-auto max-w-4xl">
      <SectionTitle title={`Order ${order.code}`} subtitle={`${order.serviceType} · ${titleize(order.paymentType)} · ${order.billableWeightKg} kg billable`}
        action={<StatusBadge status={order.status} />} />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {!terminal && (
        <div className="card card-pad mb-5 border-brand-200 bg-brand-50/40">
          <h3 className="font-semibold text-slate-900">Update delivery status</h3>
          <p className="mt-1 text-sm text-slate-600">Each update writes a permanent tracking event and notifies the customer.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {next && (
              <button className="btn-primary" disabled={busy} onClick={() => advance(next)}>
                Mark as {titleize(next)}
              </button>
            )}
            <button className="btn-danger" disabled={busy} onClick={() => setFailOpen(true)}>Mark delivery failed</button>
          </div>
        </div>
      )}

      {order.paymentType === 'COD' && order.status !== 'DELIVERED' && (
        <div className="mb-5"><Alert kind="info">Cash on delivery — collect <strong>{inr(order.declaredValue)}</strong> from the consignee.</Alert></div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {[['Pickup', pickup], ['Drop', drop]].map(([label, a]) => a && typeof a !== 'string' && (
          <div key={label as string} className="card card-pad">
            <h3 className="mb-2 font-semibold text-slate-900">{label as string}</h3>
            <p className="text-sm text-slate-600">
              {a.contactName} · <a href={`tel:${a.contactPhone}`} className="text-brand-700">{a.contactPhone}</a><br />
              {a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />{a.city}, {a.state} {a.postalCode}
            </p>
            {a.latitude && <p className="mt-2 text-xs text-slate-400">{a.latitude.toFixed(4)}, {a.longitude?.toFixed(4)}</p>}
          </div>
        ))}
      </div>

      <div className="card card-pad mt-5">
        <h3 className="mb-4 font-semibold text-slate-900">Attempts</h3>
        <div className="space-y-2 text-sm">
          {order.attempts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-4 py-3">
              <span className="font-medium">Attempt #{a.attemptNumber} — {titleize(a.status)}</span>
              <span className="text-slate-500">Scheduled {day(a.scheduledFor)}</span>
              {a.failureReason && <span className="w-full text-rose-700">Reason: {a.failureReason}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="card card-pad mt-5">
        <h3 className="mb-4 font-semibold text-slate-900">Tracking history</h3>
        <Timeline events={order.statusHistory} />
      </div>

      <Modal open={failOpen} title="Mark delivery as failed" onClose={() => setFailOpen(false)}>
        <div className="space-y-4">
          <Alert kind="info">The customer is notified, you are released from this order, and the customer can pick a new delivery date.</Alert>
          <Field label="Failure reason (required)">
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Select a reason…</option>
              {['Consignee not available', 'Address could not be located', 'Consignee refused the delivery',
                'Premises closed', 'COD amount not ready', 'Vehicle breakdown / weather'].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <button className="btn-danger w-full" disabled={busy || !reason} onClick={() => advance('FAILED', { failureReason: reason })}>
            {busy ? 'Saving…' : 'Confirm failed delivery'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
