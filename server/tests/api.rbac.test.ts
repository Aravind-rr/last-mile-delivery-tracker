import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();
const PASSWORD = 'Password@123';

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

let adminToken: string;
let customerToken: string;
let agentToken: string;

beforeAll(async () => {
  adminToken = await login('admin@lmdt.dev');
  customerToken = await login('ravi@customer.dev');
  agentToken = await login('arjun@agent.dev');
});

describe('authentication', () => {
  it('rejects a bad password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@lmdt.dev', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('rejects requests without a token', async () => {
    expect((await request(app).get('/api/orders')).status).toBe(401);
  });

  it('rejects a malformed token', async () => {
    const res = await request(app).get('/api/orders').set('Authorization', 'Bearer not-a-token');
    expect(res.status).toBe(401);
  });
});

describe('role-based access control', () => {
  it('blocks customers from admin endpoints', async () => {
    const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });

  it('blocks agents from admin endpoints', async () => {
    const res = await request(app).get('/api/agents').set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });

  it('blocks customers from assigning agents', async () => {
    const orders = await request(app).get('/api/orders').set('Authorization', `Bearer ${customerToken}`);
    const id = orders.body[0].id;
    const res = await request(app).post(`/api/assignments/orders/${id}/assign`).set('Authorization', `Bearer ${customerToken}`).send({});
    expect(res.status).toBe(403);
  });

  it('blocks customers from changing status directly', async () => {
    const orders = await request(app).get('/api/orders').set('Authorization', `Bearer ${customerToken}`);
    const id = orders.body[0].id;
    const res = await request(app).patch(`/api/orders/${id}/status`)
      .set('Authorization', `Bearer ${customerToken}`).send({ status: 'DELIVERED' });
    expect(res.status).toBe(403);
  });

  it('scopes the order list to the calling customer', async () => {
    const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${customerToken}`);
    for (const order of res.body) expect(order.customer.id).toBe(me.body.user.id);
  });

  it('lets an admin see every order', async () => {
    const admin = await request(app).get('/api/orders').set('Authorization', `Bearer ${adminToken}`);
    const customer = await request(app).get('/api/orders').set('Authorization', `Bearer ${customerToken}`);
    expect(admin.body.length).toBeGreaterThanOrEqual(customer.body.length);
  });

  it('stops an agent from touching an order that is not theirs', async () => {
    const all = await request(app).get('/api/orders').set('Authorization', `Bearer ${adminToken}`);
    const foreign = all.body.find((o: { currentAgent: unknown }) => !o.currentAgent);
    const res = await request(app).patch(`/api/orders/${foreign.id}/status`)
      .set('Authorization', `Bearer ${agentToken}`).send({ status: 'PICKED_UP' });
    expect(res.status).toBe(403);
  });
});

describe('quotes endpoint', () => {
  it('prices from the seeded database configuration', async () => {
    const res = await request(app).post('/api/quotes').set('Authorization', `Bearer ${customerToken}`).send({
      serviceType: 'B2C', paymentType: 'COD',
      lengthCm: 40, breadthCm: 30, heightCm: 25, actualWeightKg: 4,
      declaredValue: 4500, pickupPostalCode: '560034', dropPostalCode: '560048',
    });
    expect(res.status).toBe(200);
    expect(res.body.volumetricWeightKg).toBe(6);
    expect(res.body.billableWeightKg).toBe(6);
    expect(res.body.zoneScope).toBe('INTER_ZONE');
    expect(res.body.codCharge).toBe(67.5);
    expect(res.body.totalPrice).toBeGreaterThan(0);
  });

  it('rejects an unserviceable postal code', async () => {
    const res = await request(app).post('/api/quotes').set('Authorization', `Bearer ${customerToken}`).send({
      serviceType: 'B2C', paymentType: 'PREPAID',
      lengthCm: 10, breadthCm: 10, heightCm: 10, actualWeightKg: 1,
      pickupPostalCode: '999999', dropPostalCode: '560034',
    });
    expect(res.status).toBe(400);
  });

  it('validates the payload', async () => {
    const res = await request(app).post('/api/quotes').set('Authorization', `Bearer ${customerToken}`)
      .send({ serviceType: 'B2C' });
    expect(res.status).toBe(400);
  });
});
