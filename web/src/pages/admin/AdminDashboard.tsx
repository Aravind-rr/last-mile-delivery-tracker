import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import type { AdminStats } from '../../lib/types';
import { inr, titleize } from '../../lib/format';
import { Alert, SectionTitle, Spinner, StatCard } from '../../components/ui';
import { OrderTable } from '../../components/OrderTable';

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<AdminStats>('/admin/stats').then((r) => setStats(r.data)).catch((e) => setError(apiError(e)));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!stats) return <Spinner />;

  const s = stats.ordersByStatus;
  return (
    <div>
      <SectionTitle title="Operations dashboard" subtitle="Network-wide view of orders, agents and revenue."
        action={<Link to="/admin/new-order" className="btn-primary">＋ Book for a customer</Link>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total orders" value={stats.totalOrders} />
        <StatCard label="Awaiting assignment" value={stats.pendingAssignment} hint="Needs a dispatcher" />
        <StatCard label="Delivered" value={s.DELIVERED ?? 0} />
        <StatCard label="Booked revenue" value={inr(stats.revenue)} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="card card-pad lg:col-span-2">
          <h3 className="mb-4 font-semibold text-slate-900">Orders by status</h3>
          <div className="space-y-3">
            {Object.entries(s).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
              <div key={status}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium text-slate-700">{titleize(status)}</span>
                  <span className="tabular-nums text-slate-500">{count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${(count / stats.totalOrders) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <h3 className="mb-4 font-semibold text-slate-900">Fleet</h3>
          <div className="space-y-3">
            {(['AVAILABLE', 'BUSY', 'OFFLINE'] as const).map((k) => (
              <div key={k} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                <span className="text-sm font-medium text-slate-700">{titleize(k)}</span>
                <span className="text-lg font-bold text-slate-900">{stats.agentsByStatus[k] ?? 0}</span>
              </div>
            ))}
          </div>
          <Link to="/admin/agents" className="btn-ghost btn-sm mt-4 w-full">Manage agents</Link>
        </div>
      </div>

      <h2 className="mb-3 mt-8 font-semibold text-slate-900">Recent orders</h2>
      <OrderTable orders={stats.recentOrders} basePath="/admin/orders" showCustomer showAgent />
    </div>
  );
}
