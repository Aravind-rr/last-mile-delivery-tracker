import { inr, titleize } from '../lib/format';
import type { Quote } from '../lib/types';
import { Pill } from './ui';

export function PriceBreakdown({ quote, compact = false }: { quote: Quote; compact?: boolean }) {
  return (
    <div className="space-y-4">
      {!compact && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Actual weight" value={`${quote.actualWeightKg} kg`} />
          <Metric
            label="Volumetric weight"
            value={`${quote.volumetricWeightKg} kg`}
            hint={`L×B×H / ${quote.volumetricDivisor}`}
          />
          <Metric
            label="Billable weight"
            value={`${quote.billableWeightKg} kg`}
            hint={`higher of the two (${quote.billableWeightSource.toLowerCase()})`}
            highlight
          />
          <Metric label="Lane" value={titleize(quote.zoneScope)} hint={`${quote.pickupZone.code} → ${quote.dropZone.code}`} />
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full">
          <tbody className="divide-y divide-slate-100">
            {quote.lines.map((l) => (
              <tr key={l.label}>
                <td className="px-4 py-2.5">
                  <p className="text-sm font-medium text-slate-700">{l.label}</p>
                  <p className="text-xs text-slate-400">{l.detail}</p>
                </td>
                <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-slate-800">{inr(l.amount)}</td>
              </tr>
            ))}
            <tr className="bg-brand-50">
              <td className="px-4 py-3">
                <p className="text-sm font-bold text-brand-900">Total payable</p>
                <p className="text-xs text-brand-700">
                  Rate card: {quote.rateCardName} · {quote.serviceType} · {titleize(quote.paymentType)}
                </p>
              </td>
              <td className="px-4 py-3 text-right text-lg font-bold tabular-nums text-brand-800">{inr(quote.totalPrice)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Every rate, surcharge and COD fee above is read live from the admin rate-card configuration.
      </p>
    </div>
  );
}

function Metric({ label, value, hint, highlight }: { label: string; value: string; hint?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-bold ${highlight ? 'text-brand-800' : 'text-slate-800'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
      {highlight && <div className="mt-1"><Pill tone="brand">billed</Pill></div>}
    </div>
  );
}
