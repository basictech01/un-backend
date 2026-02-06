import { Request, Response, NextFunction } from 'express';
import { decodeAuthToken } from '../utils/jwt.ts';

export const optionalAuth = (req: Request, _res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            next();
            return;
        }

        const token = authHeader.substring(7);
        req.user = decodeAuthToken(token);
        next();
    } catch {
        // Invalid or expired token — silently continue
        // Resolvers decide auth per-operation via requireAuth / requireAdmin
        next();
    }
};
