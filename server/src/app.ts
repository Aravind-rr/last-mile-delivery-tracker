import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env } from './lib/env';
import { authRouter } from './routes/auth';
import { orderRouter, quoteRouter } from './routes/orders';
import { agentRouter } from './routes/agents';
import { assignmentRouter } from './routes/assignments';
import { codRouter, rateCardRouter, zoneRouter } from './routes/config';
import { adminRouter } from './routes/admin';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { openapiDocument } from './openapi';

export function createApp() {
  const app = express();
  app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',') }));
  app.use(express.json());
  app.use(morgan('dev'));

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'last-mile-delivery-tracker' }));
  app.use('/api/auth', authRouter);
  app.use('/api/quotes', quoteRouter);
  app.use('/api/orders', orderRouter);
  app.use('/api/agents', agentRouter);
  app.use('/api/assignments', assignmentRouter);
  app.use('/api/zones', zoneRouter);
  app.use('/api/rate-cards', rateCardRouter);
  app.use('/api/cod', codRouter);
  app.use('/api/admin', adminRouter);

  app.get('/openapi.json', (_req, res) => res.json(openapiDocument));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDocument));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
