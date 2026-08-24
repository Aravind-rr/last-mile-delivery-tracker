import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { Login, Register } from './pages/Login';
import { CreateOrder } from './pages/customer/CreateOrder';
import { CustomerDashboard, CustomerOrderDetail, CustomerOrders } from './pages/customer/CustomerPages';
import { AgentDashboard, AgentOrderDetail, AgentOrders } from './pages/agent/AgentPages';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminOrderDetail, AdminOrders } from './pages/admin/AdminOrders';
import { AdminAgents, AdminNotifications, AdminRates, AdminZones } from './pages/admin/AdminConfig';
import { AdminBookOrder } from './pages/admin/AdminBookOrder';
import type { Role } from './lib/types';

const HOME: Record<Role, string> = { ADMIN: '/admin', CUSTOMER: '/customer', AGENT: '/agent' };

function Protected({ roles }: { roles: Role[] }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={HOME[user.role]} replace />;
  return <Layout />;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return <Navigate to={user ? HOME[user.role] : '/login'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<Protected roles={['CUSTOMER']} />}>
            <Route path="/customer" element={<CustomerDashboard />} />
            <Route path="/customer/new" element={<CreateOrder />} />
            <Route path="/customer/orders" element={<CustomerOrders />} />
            <Route path="/customer/orders/:id" element={<CustomerOrderDetail />} />
          </Route>

          <Route element={<Protected roles={['AGENT']} />}>
            <Route path="/agent" element={<AgentDashboard />} />
            <Route path="/agent/orders" element={<AgentOrders />} />
            <Route path="/agent/orders/:id" element={<AgentOrderDetail />} />
          </Route>

          <Route element={<Protected roles={['ADMIN']} />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/orders" element={<AdminOrders />} />
            <Route path="/admin/orders/:id" element={<AdminOrderDetail />} />
            <Route path="/admin/new-order" element={<AdminBookOrder />} />
            <Route path="/admin/agents" element={<AdminAgents />} />
            <Route path="/admin/zones" element={<AdminZones />} />
            <Route path="/admin/rates" element={<AdminRates />} />
            <Route path="/admin/notifications" element={<AdminNotifications />} />
          </Route>

          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
