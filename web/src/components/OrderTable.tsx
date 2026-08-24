import { Link } from 'react-router-dom';
import { day, inr } from '../lib/format';
import type { Order } from '../lib/types';
import { StatusBadge, Empty } from './ui';

export function OrderTable({ orders, basePath, showCustomer, showAgent, actions }: {
  orders: Order[];
  basePath: string;
  showCustomer?: boolean;
  showAgent?: boolean;
  actions?: (order: Order) => React.ReactNode;
}) {
  if (orders.length === 0) return <Empty title="No orders match this view" hint="Try changing the filters or book a new order." />;
  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="th">Order</th>
            {showCustomer && <th className="th">Customer</th>}
            <th className="th">Lane</th>
            <th className="th">Service</th>
            <th className="th">Payment</th>
            <th className="th">Billable</th>
            <th className="th">Total</th>
            {showAgent && <th className="th">Agent</th>}
            <th className="th">Status</th>
            <th className="th">Booked</th>
            {actions && <th className="th text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <td className="td">
                <Link to={`${basePath}/${o.id}`} className="font-semibold text-brand-700 hover:underline">{o.code}</Link>
              </td>
              {showCustomer && <td className="td">{o.customer.name}</td>}
              <td className="td">
                <span className="font-medium">{o.pickupZone.code}</span>
                <span className="mx-1 text-slate-400">→</span>
                <span className="font-medium">{o.dropZone.code}</span>
                <span className="ml-2 text-xs text-slate-400">{o.zoneScope === 'INTRA_ZONE' ? 'intra' : 'inter'}</span>
              </td>
              <td className="td">{o.serviceType}</td>
              <td className="td">
                <span className={o.paymentType === 'COD' ? 'font-semibold text-amber-700' : ''}>{o.paymentType}</span>
              </td>
              <td className="td tabular-nums">{o.billableWeightKg} kg</td>
              <td className="td font-semibold tabular-nums">{inr(o.totalPrice)}</td>
              {showAgent && <td className="td">{o.currentAgent?.user.name ?? <span className="text-slate-400">Unassigned</span>}</td>}
              <td className="td"><StatusBadge status={o.status} /></td>
              <td className="td text-slate-500">{day(o.createdAt)}</td>
              {actions && <td className="td text-right">{actions(o)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
