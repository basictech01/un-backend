import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../../database/db.ts', () => ({
    db: { query: mockQuery },
}));

jest.unstable_mockModule('../../utils/error.ts', () => ({
    ERRORS: {
        USER_NOT_FOUND: new Error('User not found'),
        DUPLICATE_EMAIL: new Error('Email already exists'),
    },
}));

const UserRepo = await import('../../repositories/user.repository.ts');

describe('User Repository', () => {
    beforeEach(() => {
        mockQuery.mockReset();
    });

    describe('findByEmail', () => {
        it('should return user when found', async () => {
            const mockUser = { id: 1, email: 'test@test.com', name: 'Test' };
            mockQuery.mockResolvedValue([[mockUser]]);

            const user = await UserRepo.findByEmail('test@test.com');
            expect(user).toEqual(mockUser);
            expect(mockQuery).toHaveBeenCalledWith(
                'SELECT * FROM users WHERE email = ?',
                ['test@test.com']
            );
        });

        it('should return null when user not found', async () => {
            mockQuery.mockResolvedValue([[]]);

            const user = await UserRepo.findByEmail('notfound@test.com');
            expect(user).toBeNull();
        });
    });

    describe('findById', () => {
        it('should return user without password_hash', async () => {
            const mockUser = { id: 1, name: 'Test', email: 'test@test.com' };
            mockQuery.mockResolvedValue([[mockUser]]);

            const user = await UserRepo.findById(1);
            expect(user).toEqual(mockUser);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('SELECT id, name, email'),
                [1]
            );
        });

        it('should return null when user not found', async () => {
            mockQuery.mockResolvedValue([[]]);

            const user = await UserRepo.findById(999);
            expect(user).toBeNull();
        });
    });

    describe('findByIds', () => {
        it('should return users matching the given IDs', async () => {
            const mockUsers = [
                { id: 1, name: 'Alice' },
                { id: 3, name: 'Charlie' },
            ];
            mockQuery.mockResolvedValue([mockUsers]);

            const users = await UserRepo.findByIds([1, 3]);
            expect(users).toEqual(mockUsers);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('WHERE id IN (?)'),
                [[1, 3]]
            );
        });

        it('should return empty array for empty input', async () => {
            const users = await UserRepo.findByIds([]);
            expect(users).toEqual([]);
            expect(mockQuery).not.toHaveBeenCalled();
        });
    });

    describe('create', () => {
        it('should insert user and return insertId', async () => {
            mockQuery.mockResolvedValue([{ insertId: 42 }]);

            const id = await UserRepo.create('Test', 'test@test.com', 'hashedpw');
            expect(id).toBe(42);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO users'),
                ['Test', 'test@test.com', 'hashedpw', 'author']
            );
        });

        it('should accept custom role', async () => {
            mockQuery.mockResolvedValue([{ insertId: 1 }]);

            await UserRepo.create('Admin', 'admin@test.com', 'hashedpw', 'admin');
            expect(mockQuery).toHaveBeenCalledWith(
                expect.any(String),
                ['Admin', 'admin@test.com', 'hashedpw', 'admin']
            );
        });
    });

    describe('updateProfile', () => {
        it('should update provided fields', async () => {
            mockQuery.mockResolvedValue([{ affectedRows: 1 }]);

            await UserRepo.updateProfile(1, { name: 'Updated', bio: 'New bio' });
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE users SET'),
                expect.arrayContaining(['Updated', 'New bio', 1])
            );
        });

        it('should skip when no fields provided', async () => {
            await UserRepo.updateProfile(1, {});
            expect(mockQuery).not.toHaveBeenCalled();
        });
    });

    describe('updatePassword', () => {
        it('should update password hash', async () => {
            mockQuery.mockResolvedValue([{ affectedRows: 1 }]);

            await UserRepo.updatePassword(1, 'newhash');
            expect(mockQuery).toHaveBeenCalledWith(
                'UPDATE users SET password_hash = ? WHERE id = ?',
                ['newhash', 1]
            );
        });
    });

    describe('updateStatus', () => {
        it('should update is_active', async () => {
            mockQuery.mockResolvedValue([{ affectedRows: 1 }]);

            await UserRepo.updateStatus(1, false);
            expect(mockQuery).toHaveBeenCalledWith(
                'UPDATE users SET is_active = ? WHERE id = ?',
                [false, 1]
            );
        });
    });
});
