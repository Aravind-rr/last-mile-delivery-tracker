import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { conflict, unauthorized } from '../lib/http';
import { asyncHandler } from '../middleware/errors';
import { authenticate, signToken } from '../middleware/auth';

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().min(6).optional(),
});

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) throw conflict('An account with this email already exists');

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        phone: body.phone,
        passwordHash: await bcrypt.hash(body.password, 10),
        role: Role.CUSTOMER,
      },
    });
    res.status(201).json({ token: signToken(user.id), user: publicUser(user) });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user || !user.isActive) throw unauthorized('Invalid credentials');
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) throw unauthorized('Invalid credentials');
    res.json({ token: signToken(user.id), user: publicUser(user) });
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { agentProfile: { include: { baseZone: true } } },
    });
    res.json({ user: user && { ...publicUser(user), agentProfile: user.agentProfile } });
  }),
);

function publicUser(u: { id: string; name: string; email: string; phone: string | null; role: Role }) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role };
}
