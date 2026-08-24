import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../lib/env';
import { prisma } from '../lib/prisma';
import { forbidden, unauthorized } from '../lib/http';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  agentProfileId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized('Missing bearer token');
    const payload = jwt.verify(header.slice(7), env.jwtSecret) as { sub?: string };
    if (!payload.sub) throw unauthorized('Malformed token');

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { agentProfile: { select: { id: true } } },
    });
    if (!user || !user.isActive) throw unauthorized('Account not found or disabled');

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      agentProfileId: user.agentProfile?.id ?? null,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
      next(unauthorized('Invalid or expired token'));
      return;
    }
    next(err);
  }
}

/** Role-based access control guard. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`This endpoint requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}

export function actorOf(req: Request) {
  const u = req.user!;
  return { id: u.id, name: u.name, role: u.role };
}
