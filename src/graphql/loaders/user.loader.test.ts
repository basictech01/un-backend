import { jest } from '@jest/globals';
import { ok, err } from 'neverthrow';

const mockFindByIds = jest.fn<(...args: any[]) => any>();

jest.unstable_mockModule('../../repositories/user.repository.ts', () => ({
    userRepository: { findByIds: mockFindByIds },
}));

const { createUserLoader } = await import('./user.loader.ts');

describe('User DataLoader', () => {
    beforeEach(() => {
        mockFindByIds.mockReset();
    });

    it('should batch multiple .load() calls into one findByIds query', async () => {
        const users = [
            { id: 1, name: 'Alice', email: 'alice@test.com' },
            { id: 2, name: 'Bob', email: 'bob@test.com' },
            { id: 3, name: 'Charlie', email: 'charlie@test.com' },
        ];
        mockFindByIds.mockResolvedValue(ok(users));

        const loader = createUserLoader();

        const [u1, u2, u3] = await Promise.all([
            loader.load(1),
            loader.load(2),
            loader.load(3),
        ]);

        expect(mockFindByIds).toHaveBeenCalledTimes(1);
        expect(mockFindByIds).toHaveBeenCalledWith([1, 2, 3]);
        expect(u1!.name).toBe('Alice');
        expect(u2!.name).toBe('Bob');
        expect(u3!.name).toBe('Charlie');
    });

    it('should return results in the same order as requested IDs', async () => {
        const users = [
            { id: 3, name: 'Charlie' },
            { id: 1, name: 'Alice' },
        ];
        mockFindByIds.mockResolvedValue(ok(users));

        const loader = createUserLoader();
        const [u1, u2, u3] = await Promise.all([
            loader.load(1),
            loader.load(2),
            loader.load(3),
        ]);

        expect(u1!.name).toBe('Alice');
        expect(u2).toBeNull();       // id 2 not in DB
        expect(u3!.name).toBe('Charlie');
    });

    it('should return null for missing IDs', async () => {
        mockFindByIds.mockResolvedValue(ok([]));

        const loader = createUserLoader();
        const result = await loader.load(999);

        expect(result).toBeNull();
    });

    it('should return null for all IDs on database error', async () => {
        mockFindByIds.mockResolvedValue(err({ message: 'DB error', code: 10001 }));

        const loader = createUserLoader();
        const result = await loader.load(1);

        expect(result).toBeNull();
    });

    it('should cache repeated loads for the same ID within one request', async () => {
        const users = [{ id: 1, name: 'Alice' }];
        mockFindByIds.mockResolvedValue(ok(users));

        const loader = createUserLoader();

        const [first, second] = await Promise.all([
            loader.load(1),
            loader.load(1),
        ]);

        expect(mockFindByIds).toHaveBeenCalledTimes(1);
        expect(first).toBe(second); // exact same reference
    });

    it('should create independent caches per loader instance (per request)', async () => {
        const users = [{ id: 1, name: 'Alice' }];
        mockFindByIds.mockResolvedValue(ok(users));

        const loader1 = createUserLoader();
        const loader2 = createUserLoader();

        await loader1.load(1);
        await loader2.load(1);

        // Each loader calls findByIds independently
        expect(mockFindByIds).toHaveBeenCalledTimes(2);
    });
});
