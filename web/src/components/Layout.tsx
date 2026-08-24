import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../lib/types';

interface NavItem { to: string; label: string; icon: string }

const NAV: Record<Role, NavItem[]> = {
  CUSTOMER: [
    { to: '/customer', label: 'Dashboard', icon: '▦' },
    { to: '/customer/new', label: 'Create Order', icon: '＋' },
    { to: '/customer/orders', label: 'My Orders', icon: '▤' },
  ],
  AGENT: [
    { to: '/agent', label: 'Dashboard', icon: '▦' },
    { to: '/agent/orders', label: 'Assigned Orders', icon: '▤' },
  ],
  ADMIN: [
    { to: '/admin', label: 'Dashboard', icon: '▦' },
    { to: '/admin/orders', label: 'Orders', icon: '▤' },
    { to: '/admin/new-order', label: 'Book Order', icon: '＋' },
    { to: '/admin/agents', label: 'Agents', icon: '⛟' },
    { to: '/admin/zones', label: 'Zones', icon: '◈' },
    { to: '/admin/rates', label: 'Rate Cards', icon: '₹' },
    { to: '/admin/notifications', label: 'Notifications', icon: '✉' },
  ],
};

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const items = NAV[user.role];

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen lg:flex">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-slate-900 text-slate-300 transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">S</span>
          <div>
            <p className="text-sm font-bold text-white">ShipTrack</p>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Last-mile ops</p>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.to.split('/').length === 2}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-brand-600 text-white' : 'hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <span className="w-4 text-center">{i.icon}</span>
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 w-full border-t border-slate-800 p-4">
          <p className="truncate text-sm font-semibold text-white">{user.name}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          <button onClick={doLogout} className="mt-3 w-full rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-slate-800 hover:text-white">
            Sign out
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <button className="rounded p-2 text-slate-600 lg:hidden" onClick={() => setOpen(true)}>☰</button>
          <div className="hidden text-sm text-slate-500 lg:block">Last-Mile Delivery Tracker</div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            {user.role}
          </span>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
