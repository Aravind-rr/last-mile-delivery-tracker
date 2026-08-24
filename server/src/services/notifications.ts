import { NotificationChannel, NotificationStatus, OrderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../lib/env';

/**
 * Pluggable delivery adapter. Swap `console` for an SMTP / SMS provider by
 * implementing this interface and registering it in `getAdapter()`.
 */
export interface NotificationAdapter {
  name: string;
  send(payload: { channel: NotificationChannel; recipient: string; subject: string; body: string }): Promise<void>;
}

const consoleAdapter: NotificationAdapter = {
  name: 'console',
  async send({ channel, recipient, subject, body }) {
    // eslint-disable-next-line no-console
    console.log(`[notification:${channel}] -> ${recipient} | ${subject} | ${body}`);
  },
};

function getAdapter(): NotificationAdapter {
  switch (env.notificationDriver) {
    case 'console':
    default:
      return consoleAdapter;
  }
}

const STATUS_COPY: Record<OrderStatus, string> = {
  PENDING_ASSIGNMENT: 'has been booked and is waiting for an agent',
  ASSIGNED: 'has been assigned to a delivery agent',
  PICKED_UP: 'has been picked up',
  IN_TRANSIT: 'is in transit',
  OUT_FOR_DELIVERY: 'is out for delivery today',
  DELIVERED: 'has been delivered',
  FAILED: 'could not be delivered',
  RESCHEDULED: 'has been rescheduled',
  CANCELLED: 'has been cancelled',
};

export interface NotifyInput {
  orderId?: string;
  userId?: string;
  event: string;
  subject: string;
  body: string;
  channels?: NotificationChannel[];
  emailTo?: string | null;
  phoneTo?: string | null;
}

/**
 * Records notification events and attempts delivery. Failures are captured on
 * the row and never propagate — an unavailable provider must not break an order.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const adapter = getAdapter();
  const channels = input.channels ?? [NotificationChannel.EMAIL, NotificationChannel.SMS];

  for (const channel of channels) {
    const recipient = channel === NotificationChannel.EMAIL ? input.emailTo : input.phoneTo;
    if (!recipient) continue;

    let row;
    try {
      row = await prisma.notification.create({
        data: {
          orderId: input.orderId,
          userId: input.userId,
          channel,
          event: input.event,
          recipient,
          subject: input.subject,
          body: input.body,
          status: NotificationStatus.QUEUED,
        },
      });
    } catch (err) {
      console.error('[notification] could not persist event', err);
      continue;
    }

    try {
      await adapter.send({ channel, recipient, subject: input.subject, body: input.body });
      await prisma.notification.update({
        where: { id: row.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date() },
      });
    } catch (err) {
      await prisma.notification
        .update({
          where: { id: row.id },
          data: { status: NotificationStatus.FAILED, error: String(err) },
        })
        .catch(() => undefined);
    }
  }
}

export async function notifyStatusChange(orderId: string, status: OrderStatus, note?: string | null) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (!order) return;

  const subject = `Order ${order.code}: ${status.replace(/_/g, ' ')}`;
  const body = `Hi ${order.customer.name}, your order ${order.code} ${STATUS_COPY[status]}.${note ? ` Note: ${note}` : ''}`;

  await notify({
    orderId: order.id,
    userId: order.customerId,
    event: `ORDER_${status}`,
    subject,
    body,
    emailTo: order.customer.email,
    phoneTo: order.customer.phone,
  });
}
