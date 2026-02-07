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

            const result = await userRepository.create({ name: 'Test', email: 'test@test.com', passwordHash: 'hashedpw' });
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBe(42);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO users'),
                ['Test', 'test@test.com', 'hashedpw', 'author']
            );
        });

        it('should return err with DUPLICATE_EMAIL on duplicate entry', async () => {
            mockQuery.mockRejectedValue(new Error('ER_DUP_ENTRY'));

            const result = await userRepository.create({ name: 'Test', email: 'test@test.com', passwordHash: 'hashedpw' });
            expect(result.isErr()).toBe(true);
            expect(result._unsafeUnwrapErr().message).toBe('Email already exists');
        });

        it('should accept custom role', async () => {
            mockQuery.mockResolvedValue([{ insertId: 1 }]);

            await userRepository.create({ name: 'Admin', email: 'admin@test.com', passwordHash: 'hashedpw', role: 'admin' });
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

    describe('findPaginated', () => {
        const mockUsers = [
            { id: 1, name: 'Alice', email: 'alice@test.com', role: 'author', is_active: true },
            { id: 2, name: 'Bob', email: 'bob@test.com', role: 'author', is_active: true },
            { id: 3, name: 'Charlie', email: 'charlie@test.com', role: 'admin', is_active: true },
        ];

        it('should return forward paginated users', async () => {
            mockQuery.mockResolvedValue([mockUsers.slice(0, 2)]);

            const result = await userRepository.findPaginated({ first: 2 });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.users).toHaveLength(2);
            expect(data.hasMore).toBe(false);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('ORDER BY id ASC LIMIT ?'),
                [3] // limit + 1
            );
        });

        it('should detect hasMore when extra row returned', async () => {
            // Return 3 rows for limit 2 → hasMore = true, slice to 2
            mockQuery.mockResolvedValue([mockUsers]);

            const result = await userRepository.findPaginated({ first: 2 });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.users).toHaveLength(2);
            expect(data.hasMore).toBe(true);
        });

        it('should apply after cursor for forward pagination', async () => {
            mockQuery.mockResolvedValue([[mockUsers[2]]]);

            const cursor = Buffer.from('2').toString('base64');
            const result = await userRepository.findPaginated({ first: 10, after: cursor });
            expect(result.isOk()).toBe(true);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('id > ?'),
                expect.arrayContaining([2])
            );
        });

        it('should do backward pagination with before cursor', async () => {
            mockQuery.mockResolvedValue([[mockUsers[0]]]);

            const cursor = Buffer.from('2').toString('base64');
            const result = await userRepository.findPaginated({ last: 10, before: cursor });
            expect(result.isOk()).toBe(true);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('id < ?'),
                expect.arrayContaining([2])
            );
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('ORDER BY id DESC'),
                expect.anything()
            );
        });

        it('should filter by role', async () => {
            mockQuery.mockResolvedValue([[mockUsers[0], mockUsers[1]]]);

            const result = await userRepository.findPaginated({ first: 10 }, { role: 'author' });
            expect(result.isOk()).toBe(true);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('role = ?'),
                expect.arrayContaining(['author'])
            );
        });

        it('should filter by isActive', async () => {
            mockQuery.mockResolvedValue([[mockUsers[0]]]);

            const result = await userRepository.findPaginated({ first: 10 }, { isActive: true });
            expect(result.isOk()).toBe(true);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('is_active = ?'),
                expect.arrayContaining([true])
            );
        });

        it('should filter by search term', async () => {
            mockQuery.mockResolvedValue([[mockUsers[0]]]);

            const result = await userRepository.findPaginated({ first: 10 }, { search: 'ali' });
            expect(result.isOk()).toBe(true);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('(name LIKE ? OR email LIKE ?)'),
                expect.arrayContaining(['%ali%', '%ali%'])
            );
        });

        it('should return err on database failure', async () => {
            mockQuery.mockRejectedValue(new Error('connection lost'));

            const result = await userRepository.findPaginated({ first: 10 });
            expect(result.isErr()).toBe(true);
        });
    });

    describe('countFiltered', () => {
        it('should return count of users', async () => {
            mockQuery.mockResolvedValue([[{ count: 25 }]]);

            const result = await userRepository.countFiltered();
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBe(25);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('SELECT COUNT(*)'),
                []
            );
        });

        it('should apply filters to count', async () => {
            mockQuery.mockResolvedValue([[{ count: 10 }]]);

            const result = await userRepository.countFiltered({ role: 'author', isActive: true });
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBe(10);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('role = ?'),
                expect.arrayContaining(['author', true])
            );
        });

        it('should return err on database failure', async () => {
            mockQuery.mockRejectedValue(new Error('connection lost'));

            const result = await userRepository.countFiltered();
            expect(result.isErr()).toBe(true);
        });
    });
});
