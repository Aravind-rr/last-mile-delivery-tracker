import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import type { Order, PaymentType, Quote, ServiceType } from '../../lib/types';
import { Alert, Field, SectionTitle } from '../../components/ui';
import { PriceBreakdown } from '../../components/PriceBreakdown';

const emptyAddress = {
  contactName: '', contactPhone: '', line1: '', line2: '',
  city: 'Bengaluru', state: 'Karnataka', postalCode: '', latitude: '', longitude: '',
};

type AddressForm = typeof emptyAddress;

export function CreateOrder({ asAdmin = false, customers = [] }: { asAdmin?: boolean; customers?: { id: string; name: string; email: string }[] }) {
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>('B2C');
  const [paymentType, setPaymentType] = useState<PaymentType>('PREPAID');
  const [pkg, setPkg] = useState({ lengthCm: '30', breadthCm: '20', heightCm: '15', actualWeightKg: '2', declaredValue: '0' });
  const [pickup, setPickup] = useState<AddressForm>({ ...emptyAddress, contactName: 'Pickup Desk', contactPhone: '+91 98800 11111', line1: 'Unit 4, Logistics Park', postalCode: '560001' });
  const [drop, setDrop] = useState<AddressForm>({ ...emptyAddress, line1: 'Flat 302, Green Residency', postalCode: '560034' });
  const [notes, setNotes] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const num = (v: string) => Number(v);
  const pkgPayload = {
    serviceType, paymentType,
    lengthCm: num(pkg.lengthCm), breadthCm: num(pkg.breadthCm), heightCm: num(pkg.heightCm),
    actualWeightKg: num(pkg.actualWeightKg), declaredValue: num(pkg.declaredValue || '0'),
  };

  const getQuote = async () => {
    setBusy(true); setError(''); setQuote(null);
    try {
      const { data } = await api.post<Quote>('/quotes', {
        ...pkgPayload,
        pickupPostalCode: pickup.postalCode,
        dropPostalCode: drop.postalCode,
      });
      setQuote(data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const toAddr = (a: AddressForm) => ({
    contactName: a.contactName, contactPhone: a.contactPhone, line1: a.line1,
    line2: a.line2 || undefined, city: a.city, state: a.state, postalCode: a.postalCode,
    latitude: a.latitude ? Number(a.latitude) : undefined,
    longitude: a.longitude ? Number(a.longitude) : undefined,
  });

  const confirm = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post<Order>('/orders', {
        ...pkgPayload,
        ...(asAdmin ? { customerId } : {}),
        notes: notes || undefined,
        pickup: toAddr(pickup),
        drop: toAddr(drop),
      });
      navigate(asAdmin ? `/admin/orders/${data.id}` : `/customer/orders/${data.id}`);
    } catch (err) {
      setError(apiError(err));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <SectionTitle
        title="Book a delivery"
        subtitle="Enter package details and addresses, review the transparent price breakdown, then confirm."
      />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="space-y-5">
        <div className="card card-pad">
          <h3 className="mb-4 font-semibold text-slate-900">Shipment</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {asAdmin && (
              <Field label="Customer">
                <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
                  <option value="">Select a customer…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}
                </select>
              </Field>
            )}
            <Field label="Service type">
              <select className="input" value={serviceType} onChange={(e) => { setServiceType(e.target.value as ServiceType); setQuote(null); }}>
                <option value="B2C">B2C — Business to consumer</option>
                <option value="B2B">B2B — Business to business</option>
              </select>
            </Field>
            <Field label="Payment type">
              <select className="input" value={paymentType} onChange={(e) => { setPaymentType(e.target.value as PaymentType); setQuote(null); }}>
                <option value="PREPAID">Prepaid</option>
                <option value="COD">Cash on delivery</option>
              </select>
            </Field>
            {paymentType === 'COD' && (
              <Field label="Declared value (₹)" hint="COD surcharge may be a % of this">
                <input className="input" type="number" min="0" value={pkg.declaredValue}
                  onChange={(e) => { setPkg({ ...pkg, declaredValue: e.target.value }); setQuote(null); }} />
              </Field>
            )}
          </div>

          <h4 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Package dimensions &amp; weight</h4>
          <div className="mt-3 grid gap-4 sm:grid-cols-4">
            {([['lengthCm', 'Length (cm)'], ['breadthCm', 'Breadth (cm)'], ['heightCm', 'Height (cm)'], ['actualWeightKg', 'Actual weight (kg)']] as const).map(([k, label]) => (
              <Field key={k} label={label}>
                <input className="input" type="number" min="0" step="0.1" value={pkg[k]}
                  onChange={(e) => { setPkg({ ...pkg, [k]: e.target.value }); setQuote(null); }} />
              </Field>
            ))}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <AddressCard title="Pickup address" value={pickup} onChange={(v) => { setPickup(v); setQuote(null); }} />
          <AddressCard title="Drop address" value={drop} onChange={(v) => { setDrop(v); setQuote(null); }} />
        </div>

        <div className="card card-pad">
          <Field label="Notes (optional)">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Handling instructions" />
          </Field>
        </div>

        <div className="card card-pad">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">Price</h3>
              <p className="text-sm text-slate-500">Calculated from live rate cards before you confirm.</p>
            </div>
            <button className="btn-ghost" onClick={getQuote} disabled={busy}>
              {busy && !quote ? 'Calculating…' : 'Calculate price'}
            </button>
          </div>

          {quote && (
            <div className="mt-5">
              <PriceBreakdown quote={quote} />
              <button className="btn-primary mt-5 w-full sm:w-auto" onClick={confirm} disabled={busy || (asAdmin && !customerId)}>
                {busy ? 'Booking…' : `Confirm booking · ₹${quote.totalPrice}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddressCard({ title, value, onChange }: { title: string; value: AddressForm; onChange: (v: AddressForm) => void }) {
  const set = (k: keyof AddressForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="card card-pad">
      <h3 className="mb-4 font-semibold text-slate-900">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact name"><input className="input" value={value.contactName} onChange={set('contactName')} /></Field>
        <Field label="Contact phone"><input className="input" value={value.contactPhone} onChange={set('contactPhone')} /></Field>
        <div className="sm:col-span-2"><Field label="Address line 1"><input className="input" value={value.line1} onChange={set('line1')} /></Field></div>
        <div className="sm:col-span-2"><Field label="Address line 2"><input className="input" value={value.line2} onChange={set('line2')} /></Field></div>
        <Field label="City"><input className="input" value={value.city} onChange={set('city')} /></Field>
        <Field label="State"><input className="input" value={value.state} onChange={set('state')} /></Field>
        <Field label="Postal code" hint="Determines the zone"><input className="input" value={value.postalCode} onChange={set('postalCode')} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Lat"><input className="input" value={value.latitude} onChange={set('latitude')} placeholder="12.97" /></Field>
          <Field label="Lng"><input className="input" value={value.longitude} onChange={set('longitude')} placeholder="77.59" /></Field>
        </div>
      </div>
    </div>
  );
}
