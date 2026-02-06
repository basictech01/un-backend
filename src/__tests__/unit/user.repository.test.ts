import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../../database/db.ts', () => ({
    db: { query: mockQuery },
}));

jest.unstable_mockModule('../../utils/error.ts', () => ({
    ERRORS: {
        DATABASE_ERROR: { message: 'Database operation failed', code: 10001 },
        DUPLICATE_EMAIL: { message: 'Email already exists', code: 30004 },
        USER_CREATION_FAILED: { message: 'Failed to create user', code: 30002 },
        USER_UPDATE_FAILED: { message: 'Failed to update user', code: 30003 },
    },
    RequestError: class RequestError extends Error {
        code: number;
        statusCode: number;
        constructor(msg: string, code: number, statusCode: number) {
            super(msg);
            this.code = code;
            this.statusCode = statusCode;
        }
    },
}));

jest.unstable_mockModule('../../utils/logger.ts', () => ({
    default: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    }),
}));

const { userRepository } = await import('../../repositories/user.repository.ts');

describe('UserRepository', () => {
    beforeEach(() => {
        mockQuery.mockReset();
    });

    describe('findByEmail', () => {
        it('should return ok with user when found', async () => {
            const mockUser = { id: 1, email: 'test@test.com', name: 'Test' };
            mockQuery.mockResolvedValue([[mockUser]]);

            const result = await userRepository.findByEmail('test@test.com');
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toEqual(mockUser);
            expect(mockQuery).toHaveBeenCalledWith(
                'SELECT * FROM users WHERE email = ?',
                ['test@test.com']
            );
        });

        it('should return ok with null when not found', async () => {
            mockQuery.mockResolvedValue([[]]);

            const result = await userRepository.findByEmail('notfound@test.com');
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBeNull();
        });

        it('should return err on database failure', async () => {
            mockQuery.mockRejectedValue(new Error('connection lost'));

            const result = await userRepository.findByEmail('test@test.com');
            expect(result.isErr()).toBe(true);
        });
    });

    describe('findById', () => {
        it('should return ok with user', async () => {
            const mockUser = { id: 1, name: 'Test', email: 'test@test.com' };
            mockQuery.mockResolvedValue([[mockUser]]);

            const result = await userRepository.findById(1);
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toEqual(mockUser);
        });

        it('should return ok with null when not found', async () => {
            mockQuery.mockResolvedValue([[]]);

            const result = await userRepository.findById(999);
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBeNull();
        });
    });

    describe('findByIds', () => {
        it('should return ok with users matching IDs', async () => {
            const mockUsers = [{ id: 1, name: 'Alice' }, { id: 3, name: 'Charlie' }];
            mockQuery.mockResolvedValue([mockUsers]);

            const result = await userRepository.findByIds([1, 3]);
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toEqual(mockUsers);
        });

        it('should return ok with empty array for empty input', async () => {
            const result = await userRepository.findByIds([]);
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toEqual([]);
            expect(mockQuery).not.toHaveBeenCalled();
        });
    });

    describe('create', () => {
        it('should return ok with insertId', async () => {
            mockQuery.mockResolvedValue([{ insertId: 42 }]);

            const result = await userRepository.create('Test', 'test@test.com', 'hashedpw');
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBe(42);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO users'),
                ['Test', 'test@test.com', 'hashedpw', 'author']
            );
        });

        it('should return err with DUPLICATE_EMAIL on duplicate entry', async () => {
            mockQuery.mockRejectedValue(new Error('ER_DUP_ENTRY'));

            const result = await userRepository.create('Test', 'test@test.com', 'hashedpw');
            expect(result.isErr()).toBe(true);
            expect(result._unsafeUnwrapErr().message).toBe('Email already exists');
        });

        it('should accept custom role', async () => {
            mockQuery.mockResolvedValue([{ insertId: 1 }]);

            await userRepository.create('Admin', 'admin@test.com', 'hashedpw', 'admin');
            expect(mockQuery).toHaveBeenCalledWith(
                expect.any(String),
                ['Admin', 'admin@test.com', 'hashedpw', 'admin']
            );
        });
    });

    describe('updateProfile', () => {
        it('should return ok after updating fields', async () => {
            mockQuery.mockResolvedValue([{ affectedRows: 1 }]);

            const result = await userRepository.updateProfile(1, { name: 'Updated', bio: 'New bio' });
            expect(result.isOk()).toBe(true);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE users SET'),
                expect.arrayContaining(['Updated', 'New bio', 1])
            );
        });

        it('should skip when no fields provided', async () => {
            const result = await userRepository.updateProfile(1, {});
            expect(result.isOk()).toBe(true);
            expect(mockQuery).not.toHaveBeenCalled();
        });
    });

    describe('updatePassword', () => {
        it('should return ok after updating password', async () => {
            mockQuery.mockResolvedValue([{ affectedRows: 1 }]);

            const result = await userRepository.updatePassword(1, 'newhash');
            expect(result.isOk()).toBe(true);
            expect(mockQuery).toHaveBeenCalledWith(
                'UPDATE users SET password_hash = ? WHERE id = ?',
                ['newhash', 1]
            );
        });
    });

    describe('updateStatus', () => {
        it('should return ok after updating status', async () => {
            mockQuery.mockResolvedValue([{ affectedRows: 1 }]);

            const result = await userRepository.updateStatus(1, false);
            expect(result.isOk()).toBe(true);
            expect(mockQuery).toHaveBeenCalledWith(
                'UPDATE users SET is_active = ? WHERE id = ?',
                [false, 1]
            );
        });
    });
});
