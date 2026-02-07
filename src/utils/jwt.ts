import jwt, { SignOptions } from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES_IN } from '../config/env.ts';
import { ERRORS } from './error.ts';

export interface TokenData {
    userId: number;
    email: string;
    is_admin?: boolean;
}

export function createAuthToken(user: TokenData): string {
    return jwt.sign(
        { userId: user.userId, email: user.email, is_admin: user.is_admin },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN } as SignOptions
    );
}

export function createRefreshToken(user: TokenData): string {
    return jwt.sign(
        { userId: user.userId, email: user.email, is_admin: user.is_admin },
        JWT_REFRESH_SECRET,
        { expiresIn: JWT_REFRESH_EXPIRES_IN } as SignOptions
    );
}

export function decodeAuthToken(token: string): TokenData {
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as TokenData;
        return decoded;
    } catch (error: any) {
        if (error.name === 'TokenExpiredError') {
            throw ERRORS.TOKEN_EXPIRED;
        }
        throw ERRORS.INVALID_AUTH_TOKEN;
    }
}

export function decodeRefreshToken(token: string): TokenData {
    try {
        const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as TokenData;
        return decoded;
    } catch (error: any) {
        if (error.name === 'TokenExpiredError') {
            throw ERRORS.TOKEN_EXPIRED;
        }
        throw ERRORS.INVALID_REFRESH_TOKEN;
    }
}
