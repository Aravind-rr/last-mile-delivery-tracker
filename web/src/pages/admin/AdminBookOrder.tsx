import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { CreateOrder } from '../customer/CreateOrder';
import { Spinner } from '../../components/ui';

export function AdminBookOrder() {
  const [customers, setCustomers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get<{ id: string; name: string; email: string }[]>('/admin/customers')
      .then((r) => setCustomers(r.data))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <Spinner />;
  return <CreateOrder asAdmin customers={customers} />;
}
