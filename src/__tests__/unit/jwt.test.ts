import jwt from 'jsonwebtoken';
import { jest } from '@jest/globals';

// Mock env before importing jwt utils
jest.unstable_mockModule('../../config/env.ts', () => ({
    JWT_SECRET: 'test-secret',
    JWT_EXPIRES_IN: '1h',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    JWT_REFRESH_EXPIRES_IN: '7d',
}));

// Mock error.ts
jest.unstable_mockModule('../../utils/error.ts', () => ({
    ERRORS: {
        INVALID_AUTH_TOKEN: new Error('Invalid authentication token'),
        TOKEN_EXPIRED: new Error('Authentication token has expired'),
        INVALID_REFRESH_TOKEN: new Error('Invalid refresh token'),
    },
}));

const { createAuthToken, createRefreshToken, decodeAuthToken, decodeRefreshToken } =
    await import('../../utils/jwt.ts');
const { ERRORS } = await import('../../utils/error.ts');

describe('JWT Utilities', () => {
    const mockUser = { userId: 1, email: 'test@test.com', is_admin: false };

    describe('createAuthToken', () => {
        it('should create a valid auth token', () => {
            const token = createAuthToken(mockUser);
            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
        });

        it('should encode user data in token', () => {
            const token = createAuthToken(mockUser);
            const decoded = jwt.decode(token) as any;
            expect(decoded.userId).toBe(1);
            expect(decoded.email).toBe('test@test.com');
            expect(decoded.is_admin).toBe(false);
        });
    });

    describe('createRefreshToken', () => {
        it('should create a valid refresh token', () => {
            const token = createRefreshToken(mockUser);
            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
        });

        it('should be different from auth token', () => {
            const authToken = createAuthToken(mockUser);
            const refreshToken = createRefreshToken(mockUser);
            expect(authToken).not.toBe(refreshToken);
        });
    });

    describe('decodeAuthToken', () => {
        it('should decode a valid auth token', () => {
            const token = createAuthToken(mockUser);
            const decoded = decodeAuthToken(token);
            expect(decoded.userId).toBe(1);
            expect(decoded.email).toBe('test@test.com');
        });

        it('should throw on invalid token', () => {
            expect(() => decodeAuthToken('invalid-token')).toThrow(ERRORS.INVALID_AUTH_TOKEN.message);
        });

        it('should throw on expired token', () => {
            const token = jwt.sign(mockUser, 'test-secret', { expiresIn: '0s' });
            expect(() => decodeAuthToken(token)).toThrow(ERRORS.TOKEN_EXPIRED.message);
        });

        it('should reject a refresh token used as auth token', () => {
            const refreshToken = createRefreshToken(mockUser);
            expect(() => decodeAuthToken(refreshToken)).toThrow(ERRORS.INVALID_AUTH_TOKEN.message);
        });
    });

    describe('decodeRefreshToken', () => {
        it('should decode a valid refresh token', () => {
            const token = createRefreshToken(mockUser);
            const decoded = decodeRefreshToken(token);
            expect(decoded.userId).toBe(1);
            expect(decoded.email).toBe('test@test.com');
        });

        it('should throw on invalid token', () => {
            expect(() => decodeRefreshToken('invalid-token')).toThrow(ERRORS.INVALID_REFRESH_TOKEN.message);
        });

        it('should reject an auth token used as refresh token', () => {
            const authToken = createAuthToken(mockUser);
            expect(() => decodeRefreshToken(authToken)).toThrow(ERRORS.INVALID_REFRESH_TOKEN.message);
        });
    });
});
