import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import type { AgentProfile, Order, OrderStatus, Zone } from '../../lib/types';
import { day, dt, inr, titleize } from '../../lib/format';
import { Alert, Field, Modal, SectionTitle, Spinner, StatusBadge } from '../../components/ui';
import { OrderTable } from '../../components/OrderTable';
import { Timeline } from '../../components/Timeline';
import { PriceBreakdown } from '../../components/PriceBreakdown';

const STATUSES: OrderStatus[] = [
  'PENDING_ASSIGNMENT', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT',
  'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RESCHEDULED', 'CANCELLED',
];

export function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [filters, setFilters] = useState({ status: '', zoneId: '', agentId: '', search: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignFor, setAssignFor] = useState<Order | null>(null);
  const [agentId, setAgentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const { data } = await api.get<Order[]>('/orders', { params });
      setOrders(data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    api.get<Zone[]>('/zones').then((r) => setZones(r.data)).catch(() => undefined);
    api.get<AgentProfile[]>('/agents').then((r) => setAgents(r.data)).catch(() => undefined);
  }, []);

  const assign = async (order: Order, manualAgentId?: string) => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post<{ selection: { reason: string; method: string; distanceKm: number | null } }>(
        `/assignments/orders/${order.id}/assign`, manualAgentId ? { agentId: manualAgentId } : {},
      );
      setBanner(`${order.code}: ${data.selection.reason} (${titleize(data.selection.method)}${data.selection.distanceKm !== null ? `, ${data.selection.distanceKm} km` : ''})`);
      setAssignFor(null); setAgentId('');
      await load();
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <SectionTitle title="All orders" subtitle="Filter, assign agents and override statuses across the network." />
      {banner && <div className="mb-4"><Alert kind="success">{banner}</Alert></div>}
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="card card-pad mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Status">
          <select className="input" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{titleize(s)}</option>)}
          </select>
        </Field>
        <Field label="Zone">
          <select className="input" value={filters.zoneId} onChange={(e) => setFilters({ ...filters, zoneId: e.target.value })}>
            <option value="">All zones</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.code} — {z.name}</option>)}
          </select>
        </Field>
        <Field label="Agent">
          <select className="input" value={filters.agentId} onChange={(e) => setFilters({ ...filters, agentId: e.target.value })}>
            <option value="">All agents</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.user?.name}</option>)}
          </select>
        </Field>
        <Field label="Search">
          <input className="input" placeholder="Order code or customer" value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        </Field>
      </div>

      {loading ? <Spinner /> : (
        <OrderTable
          orders={orders} basePath="/admin/orders" showCustomer showAgent
          actions={(o) =>
            ['PENDING_ASSIGNMENT', 'RESCHEDULED', 'FAILED', 'ASSIGNED'].includes(o.status) ? (
              <div className="flex justify-end gap-2">
                <button className="btn-primary btn-sm" disabled={busy} onClick={() => assign(o)}>Auto-assign</button>
                <button className="btn-ghost btn-sm" onClick={() => setAssignFor(o)}>Manual</button>
              </div>
            ) : null
          }
        />
      )}

      <Modal open={!!assignFor} title={`Assign an agent to ${assignFor?.code ?? ''}`} onClose={() => setAssignFor(null)}>
        <div className="space-y-4">
          <Alert kind="info">Pickup zone: <strong>{assignFor?.pickupZone.code}</strong>. Only available agents can accept new orders.</Alert>
          <Field label="Agent">
            <select className="input" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              <option value="">Select an agent…</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id} disabled={a.status !== 'AVAILABLE'}>
                  {a.user?.name} — {titleize(a.status)} · {a.baseZone?.code ?? 'no zone'} · {a._count?.currentOrders ?? 0} active
                </option>
              ))}
            </select>
          </Field>
          <button className="btn-primary w-full" disabled={!agentId || busy} onClick={() => assignFor && assign(assignFor, agentId)}>
            {busy ? 'Assigning…' : 'Assign manually'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export function AdminOrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [override, setOverride] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try { const { data } = await api.get<Order>(`/orders/${id}`); setOrder(data); }
    catch (err) { setError(apiError(err)); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { api.get<AgentProfile[]>('/agents').then((r) => setAgents(r.data)).catch(() => undefined); }, []);

  const assign = async (agentId?: string) => {
    setBusy(true); setError(''); setOk('');
    try {
      const { data } = await api.post<{ selection: { reason: string; method: string } }>(
        `/assignments/orders/${id}/assign`, agentId ? { agentId } : {});
      setOk(`${titleize(data.selection.method)}: ${data.selection.reason}`);
      await load();
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  const applyOverride = async () => {
    if (!override) return;
    setBusy(true); setError(''); setOk('');
    try {
      await api.patch(`/orders/${id}/status`, {
        status: override, override: true, note: note || 'Manual status override by admin',
        failureReason: override === 'FAILED' ? note || 'Marked failed by admin' : undefined,
      });
      setOk(`Status overridden to ${titleize(override)}`);
      setOverride(''); setNote('');
      await load();
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  if (error && !order) return <Alert>{error}</Alert>;
  if (!order) return <Spinner />;

  return (
    <div className="mx-auto max-w-5xl">
      <SectionTitle title={`Order ${order.code}`}
        subtitle={`${order.customer.name} · booked ${dt(order.createdAt)} · ${order.serviceType} / ${titleize(order.paymentType)}`}
        action={<StatusBadge status={order.status} />} />
      {ok && <div className="mb-4"><Alert kind="success">{ok}</Alert></div>}
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="card card-pad">
            <h3 className="mb-3 font-semibold text-slate-900">Assignment</h3>
            <p className="text-sm text-slate-600">
              Current agent: <strong>{order.currentAgent?.user.name ?? 'Unassigned'}</strong>
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <button className="btn-primary" disabled={busy} onClick={() => assign()}>Auto-assign nearest</button>
              <div className="w-64">
                <Field label="Manual assignment">
                  <select className="input" defaultValue="" onChange={(e) => e.target.value && assign(e.target.value)}>
                    <option value="">Choose an agent…</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id} disabled={a.status !== 'AVAILABLE'}>
                        {a.user?.name} — {titleize(a.status)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <h4 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Assignment history</h4>
            <div className="mt-2 space-y-2">
              {order.assignments.length === 0 && <p className="text-sm text-slate-500">No assignments yet.</p>}
              {order.assignments.map((a) => (
                <div key={a.id} className="rounded-lg border border-slate-200 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{a.agent?.user.name}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {titleize(a.method)}{a.distanceKm !== null ? ` · ${a.distanceKm} km` : ''}{a.isActive ? '' : ' · released'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{dt(a.assignedAt)} · by {a.assignedBy?.name ?? 'system'}</p>
                  {a.reason && <p className="mt-1 text-slate-600">{a.reason}</p>}
                </div>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <h3 className="mb-4 font-semibold text-slate-900">Tracking timeline</h3>
            <Timeline events={order.statusHistory} />
          </div>

          <div className="card card-pad">
            <h3 className="mb-4 font-semibold text-slate-900">Price breakdown</h3>
            <PriceBreakdown quote={order.priceBreakdown} />
          </div>
        </div>

        <div className="space-y-5">
          <div className="card card-pad">
            <h3 className="mb-3 font-semibold text-slate-900">Override status</h3>
            <p className="mb-3 text-xs text-slate-500">Admin override bypasses the normal transition rules and is recorded in the history.</p>
            <Field label="New status">
              <select className="input" value={override} onChange={(e) => setOverride(e.target.value as OrderStatus)}>
                <option value="">Select…</option>
                {STATUSES.map((s) => <option key={s} value={s}>{titleize(s)}</option>)}
              </select>
            </Field>
            <div className="mt-3">
              <Field label="Reason / note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            </div>
            <button className="btn-danger mt-4 w-full" disabled={!override || busy} onClick={applyOverride}>Apply override</button>
          </div>

          <div className="card card-pad">
            <h3 className="mb-3 font-semibold text-slate-900">Summary</h3>
            <dl className="space-y-2 text-sm">
              {[
                ['Lane', `${order.pickupZone.code} → ${order.dropZone.code}`],
                ['Scope', titleize(order.zoneScope)],
                ['Dimensions', `${order.lengthCm}×${order.breadthCm}×${order.heightCm} cm`],
                ['Actual / volumetric', `${order.actualWeightKg} / ${order.volumetricWeightKg} kg`],
                ['Billable weight', `${order.billableWeightKg} kg`],
                ['COD charge', inr(order.codCharge)],
                ['Total', inr(order.totalPrice)],
                ['Rescheduled for', day(order.scheduledDate)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-slate-100 pb-2 last:border-0">
                  <dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="card card-pad">
            <h3 className="mb-3 font-semibold text-slate-900">Attempts</h3>
            <div className="space-y-2 text-sm">
              {order.attempts.map((a) => (
                <div key={a.id} className="rounded-lg border border-slate-200 px-3 py-2">
                  <p className="font-medium">#{a.attemptNumber} · {titleize(a.status)}</p>
                  <p className="text-xs text-slate-500">{day(a.scheduledFor)} · {a.agent?.user.name ?? 'unassigned'}</p>
                  {a.failureReason && <p className="text-xs text-rose-700">{a.failureReason}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
