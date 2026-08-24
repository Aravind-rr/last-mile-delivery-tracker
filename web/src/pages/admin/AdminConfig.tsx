import { useCallback, useEffect, useState } from 'react';
import { api, apiError } from '../../lib/api';
import type { AgentProfile, CodSurcharge, NotificationRow, RateCard, RateRule, Zone, ZoneScope } from '../../lib/types';
import { dt, inr, titleize } from '../../lib/format';
import { AgentBadge, Alert, Field, Modal, SectionTitle, Spinner } from '../../components/ui';

/* ----------------------------------------------------------------- agents */

export function AdminAgents() {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: 'Password@123', phone: '', vehicleType: 'BIKE', baseZoneId: '', latitude: '', longitude: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, z] = await Promise.all([api.get<AgentProfile[]>('/agents'), api.get<Zone[]>('/zones')]);
      setAgents(a.data); setZones(z.data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setBusy(true); setError('');
    try {
      await api.post('/admin/agents', {
        ...form,
        phone: form.phone || undefined,
        baseZoneId: form.baseZoneId || undefined,
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
      });
      setOpen(false);
      await load();
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  const update = async (id: string, data: Record<string, unknown>) => {
    try { await api.patch(`/agents/${id}`, data); await load(); }
    catch (err) { setError(apiError(err)); }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <SectionTitle title="Delivery agents" subtitle="Fleet availability, base zones and live coordinates."
        action={<button className="btn-primary" onClick={() => setOpen(true)}>＋ Add agent</button>} />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Agent</th><th className="th">Contact</th><th className="th">Base zone</th>
              <th className="th">Vehicle</th><th className="th">Coordinates</th><th className="th">Active load</th>
              <th className="th">Status</th><th className="th">Set status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {agents.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="td font-semibold text-slate-800">{a.user?.name}</td>
                <td className="td text-slate-500">{a.user?.email}<br />{a.user?.phone}</td>
                <td className="td">
                  <select className="input py-1 text-xs" value={a.baseZoneId ?? ''} onChange={(e) => update(a.id, { baseZoneId: e.target.value || null })}>
                    <option value="">— none —</option>
                    {zones.map((z) => <option key={z.id} value={z.id}>{z.code}</option>)}
                  </select>
                </td>
                <td className="td">{titleize(a.vehicleType)}</td>
                <td className="td text-xs text-slate-500">
                  {a.latitude !== null ? `${a.latitude.toFixed(4)}, ${a.longitude?.toFixed(4)}` : '—'}
                  <br /><span className="text-slate-400">{a.locationUpdatedAt ? dt(a.locationUpdatedAt) : 'never'}</span>
                </td>
                <td className="td tabular-nums">{a._count?.currentOrders ?? 0} / {a.maxActiveOrders}</td>
                <td className="td"><AgentBadge status={a.status} /></td>
                <td className="td">
                  <select className="input py-1 text-xs" value={a.status} onChange={(e) => update(a.id, { status: e.target.value })}>
                    {['AVAILABLE', 'BUSY', 'OFFLINE'].map((s) => <option key={s} value={s}>{titleize(s)}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} title="Create a delivery agent" onClose={() => setOpen(false)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Password"><input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Vehicle">
            <select className="input" value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
              {['BIKE', 'VAN', 'MINI_TRUCK'].map((v) => <option key={v} value={v}>{titleize(v)}</option>)}
            </select>
          </Field>
          <Field label="Base zone">
            <select className="input" value={form.baseZoneId} onChange={(e) => setForm({ ...form, baseZoneId: e.target.value })}>
              <option value="">— none —</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.code} — {z.name}</option>)}
            </select>
          </Field>
          <Field label="Latitude"><input className="input" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></Field>
          <Field label="Longitude"><input className="input" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></Field>
        </div>
        <button className="btn-primary mt-5 w-full" disabled={busy || !form.name || !form.email} onClick={create}>
          {busy ? 'Creating…' : 'Create agent'}
        </button>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ zones */

export function AdminZones() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [zoneOpen, setZoneOpen] = useState(false);
  const [areaFor, setAreaFor] = useState<Zone | null>(null);
  const [zoneForm, setZoneForm] = useState({ code: '', name: '', city: 'Bengaluru', centerLat: '', centerLng: '' });
  const [areaForm, setAreaForm] = useState({ postalCode: '', areaName: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get<Zone[]>('/zones'); setZones(data); }
    catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const createZone = async () => {
    setBusy(true); setError('');
    try {
      await api.post('/zones', {
        ...zoneForm,
        centerLat: zoneForm.centerLat ? Number(zoneForm.centerLat) : undefined,
        centerLng: zoneForm.centerLng ? Number(zoneForm.centerLng) : undefined,
      });
      setZoneOpen(false); setZoneForm({ code: '', name: '', city: 'Bengaluru', centerLat: '', centerLng: '' });
      await load();
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  const addArea = async () => {
    if (!areaFor) return;
    setBusy(true); setError('');
    try {
      await api.post(`/zones/${areaFor.id}/areas`, areaForm);
      setAreaForm({ postalCode: '', areaName: '' });
      const { data } = await api.get<Zone[]>('/zones');
      setZones(data);
      setAreaFor(data.find((z) => z.id === areaFor.id) ?? null);
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  const removeArea = async (areaId: string) => {
    try {
      await api.delete(`/zones/areas/${areaId}`);
      const { data } = await api.get<Zone[]>('/zones');
      setZones(data);
      setAreaFor((prev) => (prev ? data.find((z) => z.id === prev.id) ?? null : null));
    } catch (err) { setError(apiError(err)); }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <SectionTitle title="Zones &amp; serviceable areas" subtitle="Postal codes decide the pickup and drop zone, which decides intra vs inter-zone pricing."
        action={<button className="btn-primary" onClick={() => setZoneOpen(true)}>＋ Add zone</button>} />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {zones.map((z) => (
          <div key={z.id} className="card card-pad">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-bold text-slate-900">{z.code}</p>
                <p className="text-sm text-slate-500">{z.name} · {z.city}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${z.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                {z.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {z.centerLat !== null ? `Centre ${z.centerLat.toFixed(3)}, ${z.centerLng?.toFixed(3)}` : 'No centre set'} · {z._count?.agents ?? 0} agents
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {z.areas?.map((a) => (
                <span key={a.id} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700" title={a.areaName}>{a.postalCode}</span>
              ))}
            </div>
            <button className="btn-ghost btn-sm mt-4 w-full" onClick={() => setAreaFor(z)}>Manage postal codes</button>
          </div>
        ))}
      </div>

      <Modal open={zoneOpen} title="Create a zone" onClose={() => setZoneOpen(false)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code"><input className="input" placeholder="BLR-W" value={zoneForm.code} onChange={(e) => setZoneForm({ ...zoneForm, code: e.target.value })} /></Field>
          <Field label="Name"><input className="input" value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} /></Field>
          <Field label="City"><input className="input" value={zoneForm.city} onChange={(e) => setZoneForm({ ...zoneForm, city: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Centre lat"><input className="input" value={zoneForm.centerLat} onChange={(e) => setZoneForm({ ...zoneForm, centerLat: e.target.value })} /></Field>
            <Field label="Centre lng"><input className="input" value={zoneForm.centerLng} onChange={(e) => setZoneForm({ ...zoneForm, centerLng: e.target.value })} /></Field>
          </div>
        </div>
        <button className="btn-primary mt-5 w-full" disabled={busy || !zoneForm.code} onClick={createZone}>Create zone</button>
      </Modal>

      <Modal open={!!areaFor} title={`Postal codes · ${areaFor?.code ?? ''}`} onClose={() => setAreaFor(null)}>
        <div className="space-y-4">
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {areaFor?.areas?.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span><strong>{a.postalCode}</strong> — {a.areaName}</span>
                <button className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => removeArea(a.id)}>Remove</button>
              </div>
            ))}
            {areaFor?.areas?.length === 0 && <p className="text-sm text-slate-500">No postal codes mapped yet.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Postal code"><input className="input" value={areaForm.postalCode} onChange={(e) => setAreaForm({ ...areaForm, postalCode: e.target.value })} /></Field>
            <Field label="Area name"><input className="input" value={areaForm.areaName} onChange={(e) => setAreaForm({ ...areaForm, areaName: e.target.value })} /></Field>
          </div>
          <button className="btn-primary w-full" disabled={busy || !areaForm.postalCode || !areaForm.areaName} onClick={addArea}>Add mapping</button>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------- rate cards */

export function AdminRates() {
  const [cards, setCards] = useState<RateCard[]>([]);
  const [cod, setCod] = useState<CodSurcharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([api.get<RateCard[]>('/rate-cards'), api.get<CodSurcharge[]>('/cod')]);
      setCards(c.data); setCod(s.data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const saveCard = async (card: RateCard, patch: Partial<RateCard>) => {
    setError(''); setOk('');
    try { await api.patch(`/rate-cards/${card.id}`, patch); setOk(`${card.name} updated`); await load(); }
    catch (err) { setError(apiError(err)); }
  };

  const saveRule = async (cardId: string, scope: ZoneScope, rule: Partial<RateRule>) => {
    setError(''); setOk('');
    try {
      await api.put(`/rate-cards/${cardId}/rules`, {
        scope,
        baseCharge: Number(rule.baseCharge), includedWeightKg: Number(rule.includedWeightKg),
        perKgCharge: Number(rule.perKgCharge), minCharge: Number(rule.minCharge ?? 0),
      });
      setOk(`${titleize(scope)} rule saved`);
      await load();
    } catch (err) { setError(apiError(err)); }
  };

  const saveCod = async (row: CodSurcharge, patch: Partial<CodSurcharge>) => {
    setError(''); setOk('');
    try { await api.patch(`/cod/${row.id}`, patch); setOk(`${row.serviceType} COD surcharge updated`); await load(); }
    catch (err) { setError(apiError(err)); }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <SectionTitle title="Rate cards &amp; COD configuration" subtitle="Every quote is priced from these rows — nothing is hardcoded." />
      {ok && <div className="mb-4"><Alert kind="success">{ok}</Alert></div>}
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="space-y-5">
        {cards.map((card) => <RateCardEditor key={card.id} card={card} onSaveCard={saveCard} onSaveRule={saveRule} />)}
      </div>

      <h2 className="mb-3 mt-8 font-semibold text-slate-900">COD surcharges</h2>
      <div className="grid gap-5 md:grid-cols-2">
        {cod.map((row) => <CodEditor key={row.id} row={row} onSave={saveCod} />)}
      </div>
    </div>
  );
}

function RateCardEditor({ card, onSaveCard, onSaveRule }: {
  card: RateCard;
  onSaveCard: (card: RateCard, patch: Partial<RateCard>) => void;
  onSaveRule: (cardId: string, scope: ZoneScope, rule: Partial<RateRule>) => void;
}) {
  const [header, setHeader] = useState({
    fuelSurchargePercent: String(card.fuelSurchargePercent),
    taxPercent: String(card.taxPercent),
    volumetricDivisor: String(card.volumetricDivisor),
  });

  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{card.name}</h3>
          <p className="text-sm text-slate-500">{card.serviceType} · {card.currency} · {card.isActive ? 'active' : 'inactive'}</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => onSaveCard(card, { isActive: !card.isActive })}>
          {card.isActive ? 'Deactivate' : 'Activate'}
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <Field label="Volumetric divisor" hint="L×B×H ÷ divisor">
          <input className="input" value={header.volumetricDivisor} onChange={(e) => setHeader({ ...header, volumetricDivisor: e.target.value })} />
        </Field>
        <Field label="Fuel surcharge %">
          <input className="input" value={header.fuelSurchargePercent} onChange={(e) => setHeader({ ...header, fuelSurchargePercent: e.target.value })} />
        </Field>
        <Field label="Tax %">
          <input className="input" value={header.taxPercent} onChange={(e) => setHeader({ ...header, taxPercent: e.target.value })} />
        </Field>
        <div className="flex items-end">
          <button className="btn-primary w-full" onClick={() => onSaveCard(card, {
            volumetricDivisor: Number(header.volumetricDivisor),
            fuelSurchargePercent: Number(header.fuelSurchargePercent),
            taxPercent: Number(header.taxPercent),
          })}>Save card</button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {(['INTRA_ZONE', 'INTER_ZONE'] as ZoneScope[]).map((scope) => (
          <RuleEditor key={scope} scope={scope} rule={card.rules.find((r) => r.scope === scope)}
            onSave={(r) => onSaveRule(card.id, scope, r)} />
        ))}
      </div>
    </div>
  );
}

function RuleEditor({ scope, rule, onSave }: { scope: ZoneScope; rule?: RateRule; onSave: (r: Partial<RateRule>) => void }) {
  const [form, setForm] = useState({
    baseCharge: String(rule?.baseCharge ?? 0),
    includedWeightKg: String(rule?.includedWeightKg ?? 1),
    perKgCharge: String(rule?.perKgCharge ?? 0),
    minCharge: String(rule?.minCharge ?? 0),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
      <p className="mb-3 text-sm font-semibold text-slate-800">{titleize(scope)} rate</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Base charge"><input className="input" value={form.baseCharge} onChange={set('baseCharge')} /></Field>
        <Field label="Included kg"><input className="input" value={form.includedWeightKg} onChange={set('includedWeightKg')} /></Field>
        <Field label="Per extra kg"><input className="input" value={form.perKgCharge} onChange={set('perKgCharge')} /></Field>
        <Field label="Minimum charge"><input className="input" value={form.minCharge} onChange={set('minCharge')} /></Field>
      </div>
      <button className="btn-ghost btn-sm mt-3 w-full" onClick={() => onSave(form as unknown as Partial<RateRule>)}>Save rule</button>
    </div>
  );
}

function CodEditor({ row, onSave }: { row: CodSurcharge; onSave: (row: CodSurcharge, patch: Partial<CodSurcharge>) => void }) {
  const [form, setForm] = useState({
    mode: row.mode, flatAmount: String(row.flatAmount),
    percentOfValue: String(row.percentOfValue), minAmount: String(row.minAmount),
  });
  return (
    <div className="card card-pad">
      <h3 className="font-semibold text-slate-900">{row.serviceType} cash on delivery</h3>
      <p className="mt-1 text-xs text-slate-500">Currently: {titleize(row.mode)} · flat {inr(row.flatAmount)} · {row.percentOfValue}% of declared value</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Mode">
          <select className="input" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as CodSurcharge['mode'] })}>
            <option value="FLAT">Flat fee</option>
            <option value="PERCENT_OF_VALUE">Percent of declared value</option>
            <option value="HIGHER_OF_BOTH">Higher of both</option>
          </select>
        </Field>
        <Field label="Flat amount (₹)"><input className="input" value={form.flatAmount} onChange={(e) => setForm({ ...form, flatAmount: e.target.value })} /></Field>
        <Field label="Percent of value"><input className="input" value={form.percentOfValue} onChange={(e) => setForm({ ...form, percentOfValue: e.target.value })} /></Field>
        <Field label="Minimum amount (₹)"><input className="input" value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: e.target.value })} /></Field>
      </div>
      <button className="btn-primary mt-4 w-full" onClick={() => onSave(row, {
        mode: form.mode, flatAmount: Number(form.flatAmount),
        percentOfValue: Number(form.percentOfValue), minAmount: Number(form.minAmount),
      })}>Save COD configuration</button>
    </div>
  );
}

/* ---------------------------------------------------------- notifications */

export function AdminNotifications() {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get<NotificationRow[]>('/admin/notifications').then((r) => setRows(r.data)).finally(() => setLoading(false));
  }, []);
  if (loading) return <Spinner />;
  return (
    <div>
      <SectionTitle title="Notification log" subtitle="Every status change raises an email and SMS event through the pluggable notification adapter." />
      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr><th className="th">Sent</th><th className="th">Order</th><th className="th">Channel</th><th className="th">Recipient</th><th className="th">Message</th><th className="th">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((n) => (
              <tr key={n.id}>
                <td className="td text-slate-500">{dt(n.createdAt)}</td>
                <td className="td font-semibold">{n.order?.code ?? '—'}</td>
                <td className="td">{n.channel}</td>
                <td className="td text-slate-500">{n.recipient}</td>
                <td className="td max-w-md truncate whitespace-normal text-slate-600">{n.body}</td>
                <td className="td">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${n.status === 'SENT' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{n.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
