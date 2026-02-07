import { encodeCursor, decodeCursor, buildConnection } from '../../types/pagination.ts';

describe('Pagination Helpers', () => {
    describe('encodeCursor / decodeCursor', () => {
        it('should round-trip encode and decode an id', () => {
            const id = 42;
            const cursor = encodeCursor(id);
            expect(decodeCursor(cursor)).toBe(id);
        });

        it('should handle id 1', () => {
            expect(decodeCursor(encodeCursor(1))).toBe(1);
        });

        it('should handle large ids', () => {
            const id = 999999;
            expect(decodeCursor(encodeCursor(id))).toBe(id);
        });

        it('should throw on invalid cursor', () => {
            // base64 of "abc" is not a valid number
            const invalidCursor = Buffer.from('abc').toString('base64');
            expect(() => decodeCursor(invalidCursor)).toThrow('Invalid cursor');
        });
    });

    describe('buildConnection', () => {
        const makeNodes = (ids: number[]) =>
            ids.map(id => ({ id, name: `User ${id}`, email: `user${id}@test.com` }));

        it('should build forward connection with hasMore', () => {
            const nodes = makeNodes([1, 2, 3]);
            const conn = buildConnection(nodes, true, 'forward');

            expect(conn.edges).toHaveLength(3);
            expect(conn.edges[0].node.id).toBe(1);
            expect(conn.edges[2].node.id).toBe(3);
            expect(conn.edges[0].cursor).toBe(encodeCursor(1));
            expect(conn.edges[2].cursor).toBe(encodeCursor(3));
            expect(conn.pageInfo.hasNextPage).toBe(true);
            expect(conn.pageInfo.hasPreviousPage).toBe(false);
            expect(conn.pageInfo.startCursor).toBe(encodeCursor(1));
            expect(conn.pageInfo.endCursor).toBe(encodeCursor(3));
        });

        it('should build forward connection without hasMore', () => {
            const nodes = makeNodes([1, 2]);
            const conn = buildConnection(nodes, false, 'forward');

            expect(conn.pageInfo.hasNextPage).toBe(false);
            expect(conn.pageInfo.hasPreviousPage).toBe(false);
        });

        it('should build backward connection with hasMore', () => {
            const nodes = makeNodes([4, 5, 6]);
            const conn = buildConnection(nodes, true, 'backward');

            expect(conn.edges).toHaveLength(3);
            expect(conn.pageInfo.hasNextPage).toBe(false);
            expect(conn.pageInfo.hasPreviousPage).toBe(true);
            expect(conn.pageInfo.startCursor).toBe(encodeCursor(4));
            expect(conn.pageInfo.endCursor).toBe(encodeCursor(6));
        });

        it('should handle empty nodes', () => {
            const conn = buildConnection([], false, 'forward');

            expect(conn.edges).toHaveLength(0);
            expect(conn.pageInfo.startCursor).toBeNull();
            expect(conn.pageInfo.endCursor).toBeNull();
            expect(conn.pageInfo.hasNextPage).toBe(false);
            expect(conn.pageInfo.hasPreviousPage).toBe(false);
        });
    });
});
