import type { ReactNode } from 'react';
import { STATUS_STYLES, titleize } from '../lib/format';
import type { AgentStatus, OrderStatus } from '../lib/types';

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[status]}`}>
      {titleize(status)}
    </span>
  );
}

const AGENT_STYLES: Record<AgentStatus, string> = {
  AVAILABLE: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  BUSY: 'bg-amber-100 text-amber-800 ring-amber-200',
  OFFLINE: 'bg-slate-200 text-slate-600 ring-slate-300',
};

export function AgentBadge({ status }: { status: AgentStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${AGENT_STYLES[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {titleize(status)}
    </span>
  );
}

export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'brand' | 'emerald' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    brand: 'bg-brand-50 text-brand-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  };
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'brand' }: { label: string; value: string | number; hint?: string; tone?: string }) {
  return (
    <div className="card card-pad">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold text-${tone}-700`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-rose-200 bg-rose-50 text-rose-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
  };
  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles[kind]}`}>{children}</div>;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card card-pad text-center">
      <p className="font-semibold text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
    </div>
  );
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8">
      <div className="card w-full max-w-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
