import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiError } from '../lib/api';
import { Alert } from '../components/ui';
import type { Role } from '../lib/types';

const HOME: Record<Role, string> = { ADMIN: '/admin', CUSTOMER: '/customer', AGENT: '/agent' };

const DEMO = [
  { label: 'Admin', email: 'admin@lmdt.dev' },
  { label: 'Customer', email: 'ravi@customer.dev' },
  { label: 'Agent', email: 'arjun@agent.dev' },
];

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@lmdt.dev');
  const [password, setPassword] = useState('Password@123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await login(email, password);
      navigate(HOME[user.role]);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h2 className="text-xl font-bold text-slate-900">Sign in</h2>
      <p className="mt-1 text-sm text-slate-500">Use a demo account or your own credentials.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {error && <Alert>{error}</Alert>}
        <div>
          <label className="label">Email</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>

      <div className="mt-6 rounded-lg border border-dashed border-slate-300 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Demo accounts · Password@123</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              onClick={() => { setEmail(d.email); setPassword('Password@123'); }}
              className="btn-ghost btn-sm"
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-slate-500">
        New customer? <Link to="/register" className="font-semibold text-brand-700 hover:underline">Create an account</Link>
      </p>
    </AuthShell>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(form);
      navigate('/customer');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <AuthShell>
      <h2 className="text-xl font-bold text-slate-900">Create a customer account</h2>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {error && <Alert>{error}</Alert>}
        <div><label className="label">Full name</label><input className="input" value={form.name} onChange={set('name')} required minLength={2} /></div>
        <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={set('email')} required /></div>
        <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={set('phone')} placeholder="+91 90000 00000" /></div>
        <div><label className="label">Password</label><input className="input" type="password" value={form.password} onChange={set('password')} required minLength={6} /></div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already registered? <Link to="/login" className="font-semibold text-brand-700 hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-slate-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold">S</span>
          <span className="text-lg font-bold">ShipTrack</span>
        </div>
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">Last-mile delivery, tracked end to end.</h1>
          <p className="mt-4 max-w-md text-slate-400">
            Zone-based pricing with volumetric weight, B2B and B2C rate cards, COD surcharges,
            nearest-agent assignment and an immutable tracking trail for every shipment.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4 text-sm">
            {[['Zones', 'Postal-code mapped'], ['Pricing', 'Fully configurable'], ['Tracking', 'Immutable history']].map(([t, s]) => (
              <div key={t} className="rounded-lg border border-slate-800 p-3">
                <p className="font-semibold">{t}</p>
                <p className="text-xs text-slate-400">{s}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500">Demo environment · seeded data</p>
      </div>
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card card-pad w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
