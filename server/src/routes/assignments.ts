import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { asyncHandler } from '../middleware/errors';
import { actorOf, authenticate, requireRole } from '../middleware/auth';
import { assignAgent } from '../services/assignment';
import { prisma } from '../lib/prisma';

export const assignmentRouter = Router();

/** Manual assignment when `agentId` is supplied, automatic nearest-agent otherwise. */
assignmentRouter.post(
  '/orders/:id/assign',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const body = z.object({ agentId: z.string().optional() }).parse(req.body ?? {});
    const result = await assignAgent({ orderId: req.params.id, agentId: body.agentId, actor: actorOf(req) });
    res.json(result);
  }),
);

assignmentRouter.get(
  '/orders/:id/assignments',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const rows = await prisma.agentAssignment.findMany({
      where: { orderId: req.params.id },
      include: { agent: { include: { user: { select: { name: true } } } }, assignedBy: { select: { name: true } } },
      orderBy: { assignedAt: 'desc' },
    });
    res.json(rows);
  }),
);
