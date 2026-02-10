import { encodeCursor, decodeCursor, buildConnection } from './pagination.ts';

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

        it('should build connection with hasNextPage', () => {
            const nodes = makeNodes([1, 2, 3]);
            const conn = buildConnection(nodes, true);

            expect(conn.edges).toHaveLength(3);
            expect(conn.edges[0].node.id).toBe(1);
            expect(conn.edges[2].node.id).toBe(3);
            expect(conn.edges[0].cursor).toBe(encodeCursor(1));
            expect(conn.edges[2].cursor).toBe(encodeCursor(3));
            expect(conn.pageInfo.hasNextPage).toBe(true);
            expect(conn.pageInfo.startCursor).toBe(encodeCursor(1));
            expect(conn.pageInfo.endCursor).toBe(encodeCursor(3));
        });

        it('should build connection without hasNextPage', () => {
            const nodes = makeNodes([1, 2]);
            const conn = buildConnection(nodes, false);

            expect(conn.pageInfo.hasNextPage).toBe(false);
        });

        it('should handle empty nodes', () => {
            const conn = buildConnection([], false);

            expect(conn.edges).toHaveLength(0);
            expect(conn.pageInfo.startCursor).toBeNull();
            expect(conn.pageInfo.endCursor).toBeNull();
            expect(conn.pageInfo.hasNextPage).toBe(false);
        });
    });
});
