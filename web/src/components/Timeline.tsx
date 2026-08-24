import { dt, titleize } from '../lib/format';
import type { StatusHistory } from '../lib/types';

const DOT: Record<string, string> = {
  DELIVERED: 'bg-emerald-500',
  FAILED: 'bg-rose-500',
  RESCHEDULED: 'bg-orange-500',
  CANCELLED: 'bg-slate-400',
};

export function Timeline({ events }: { events: StatusHistory[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">No tracking events yet.</p>;
  return (
    <ol className="relative space-y-6 border-l-2 border-slate-200 pl-6">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className={`absolute -left-[31px] top-1 h-4 w-4 rounded-full ring-4 ring-white ${DOT[e.newStatus] ?? 'bg-brand-500'}`} />
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-900">{titleize(e.newStatus)}</p>
            {e.previousStatus && (
              <span className="text-xs text-slate-400">from {titleize(e.previousStatus)}</span>
            )}
          </div>
          <p className="text-xs text-slate-500">{dt(e.createdAt)} · {e.actorLabel}</p>
          {e.note && <p className="mt-1 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{e.note}</p>}
        </li>
      ))}
    </ol>
  );
}
