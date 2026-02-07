// Apollo/Relay-style cursor-based pagination types
// https://www.apollographql.com/docs/react/pagination/cursor-based

export type PageInfo = {
    startCursor: string | null;
    endCursor: string | null;
    hasNextPage: boolean;
};

export type Edge<T> = {
    cursor: string;
    node: T;
};

export type Connection<T> = {
    edges: Edge<T>[];
    pageInfo: PageInfo;
};

export interface PaginationArgs {
    first?: number;
    after?: string;
}

// Cursor encoding/decoding helpers
export function encodeCursor(id: number): string {
    return Buffer.from(String(id)).toString('base64');
}

export function decodeCursor(cursor: string): number {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const id = parseInt(decoded, 10);
    if (isNaN(id)) {
        throw new Error('Invalid cursor');
    }
    return id;
}

// Build a Connection<T> from a list of nodes
export function buildConnection<T extends { id: number }>(
    nodes: T[],
    hasMore: boolean,
): Connection<T> {
    const edges: Edge<T>[] = nodes.map(node => ({
        cursor: encodeCursor(node.id),
        node,
    }));

    const pageInfo: PageInfo = {
        startCursor: edges.length > 0 ? edges[0].cursor : null,
        endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
        hasNextPage: hasMore,
    };

    return { edges, pageInfo };
}
