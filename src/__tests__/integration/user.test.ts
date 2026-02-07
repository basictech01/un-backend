import { jest } from '@jest/globals';

// --- Mocks (must be set up before imports) ---

const mockQuery = jest.fn();

jest.unstable_mockModule('../../database/db.ts', () => ({
    db: { query: mockQuery },
    connectToDatabase: jest.fn(),
}));

jest.unstable_mockModule('../../config/env.ts', () => ({
    PORT: '4000',
    NODE_ENV: 'test',
    CORS_ORIGIN: '*',
    JWT_SECRET: 'test-jwt-secret',
    JWT_EXPIRES_IN: '1h',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    JWT_REFRESH_EXPIRES_IN: '7d',
    RATE_LIMIT_WINDOW_MS: 900000,
    RATE_LIMIT_MAX: 1000,
    DB_HOST: 'localhost',
    DB_USER: 'root',
    DB_PASSWORD: '',
    DB_NAME: 'test',
    DB_PORT: 3306,
}));

jest.unstable_mockModule('../../utils/logger.ts', () => ({
    default: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    }),
}));

const { ApolloServer } = await import('@apollo/server');
const { expressMiddleware } = await import('@as-integrations/express5');
const express = await import('express');
const supertest = await import('supertest');
const { buildGraphQL } = await import('../../graphql/loaders/graphql.loader.ts');
const { optionalAuth } = await import('../../middleware/auth.middleware.ts');
const { createAuthToken } = await import('../../utils/jwt.ts');
const { createLoaders } = await import('../../graphql/loaders/user.loader.ts');

// --- Test server setup ---

let app: any;
let apollo: InstanceType<typeof ApolloServer>;

beforeAll(async () => {
    const { typeDefs, resolvers } = buildGraphQL();

    app = express.default();
    apollo = new ApolloServer({ typeDefs, resolvers });
    await apollo.start();

    app.use(express.default.json());
    app.use('/graphql', optionalAuth, expressMiddleware(apollo, {
        context: async ({ req }: any) => ({ req, user: req.user ?? null, loaders: createLoaders() }),
    }));
});

afterAll(async () => {
    await apollo.stop();
});

beforeEach(() => {
    mockQuery.mockReset();
});

// --- Helpers ---

function gql(query: string, variables?: Record<string, any>) {
    return supertest.default(app)
        .post('/graphql')
        .send({ query, variables });
}

function gqlAuth(token: string, query: string, variables?: Record<string, any>) {
    return supertest.default(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${token}`)
        .send({ query, variables });
}

const adminToken = createAuthToken({ userId: 1, email: 'admin@test.com', is_admin: true });
const authorToken = createAuthToken({ userId: 2, email: 'author@test.com', is_admin: false });

const mockAuthor = {
    id: 2, name: 'Author User', email: 'author@test.com',
    bio: 'A bio', profession: 'Writer', profile_photo: null,
    role: 'author', is_active: true, created_at: new Date().toISOString(),
};

const mockAdmin = {
    id: 1, name: 'Admin User', email: 'admin@test.com',
    bio: null, profession: null, profile_photo: null,
    role: 'admin', is_active: true, created_at: new Date().toISOString(),
};

// --- Tests ---

describe('User Management Integration', () => {
    describe('Query: users', () => {
        const usersQuery = `
            query($first: Int, $after: String) {
                users(first: $first, after: $after) {
                    edges { cursor node { id name email role } }
                    pageInfo { startCursor endCursor hasNextPage hasPreviousPage }
                    totalCount
                }
            }
        `;

        it('should return paginated users for admin', async () => {
            // findPaginated query
            mockQuery.mockResolvedValueOnce([[mockAdmin, mockAuthor]]);
            // countFiltered query
            mockQuery.mockResolvedValueOnce([[{ count: 2 }]]);

            const res = await gqlAuth(adminToken, usersQuery, { first: 10 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.users.edges).toHaveLength(2);
            expect(res.body.data.users.totalCount).toBe(2);
            expect(res.body.data.users.pageInfo.hasNextPage).toBe(false);
        });

        it('should reject non-admin', async () => {
            const res = await gqlAuth(authorToken, usersQuery, { first: 10 });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Admin access required');
        });

        it('should reject unauthenticated', async () => {
            const res = await gql(usersQuery, { first: 10 });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Unauthorized access');
        });
    });

    describe('Query: authors', () => {
        const authorsQuery = `
            query($first: Int) {
                authors(first: $first) {
                    edges { cursor node { id name role } }
                    pageInfo { hasNextPage }
                    totalCount
                }
            }
        `;

        it('should return only authors without auth', async () => {
            mockQuery.mockResolvedValueOnce([[mockAuthor]]);
            mockQuery.mockResolvedValueOnce([[{ count: 1 }]]);

            const res = await gql(authorsQuery, { first: 10 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.authors.edges).toHaveLength(1);
            expect(res.body.data.authors.edges[0].node.role).toBe('author');
            expect(res.body.data.authors.totalCount).toBe(1);
        });

        it('should filter by role=author in the query', async () => {
            mockQuery.mockResolvedValueOnce([[]]);
            mockQuery.mockResolvedValueOnce([[{ count: 0 }]]);

            await gql(authorsQuery, { first: 10 });

            // First call is findPaginated - should contain role filter
            expect(mockQuery.mock.calls[0][0]).toContain('role = ?');
            expect(mockQuery.mock.calls[0][1]).toContain('author');
        });
    });

    describe('Query: admins', () => {
        const adminsQuery = `
            query($first: Int) {
                admins(first: $first) {
                    edges { cursor node { id name role } }
                    totalCount
                }
            }
        `;

        it('should return only admins for admin user', async () => {
            mockQuery.mockResolvedValueOnce([[mockAdmin]]);
            mockQuery.mockResolvedValueOnce([[{ count: 1 }]]);

            const res = await gqlAuth(adminToken, adminsQuery, { first: 10 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.admins.edges).toHaveLength(1);
            expect(res.body.data.admins.edges[0].node.role).toBe('admin');
        });

        it('should reject non-admin', async () => {
            const res = await gqlAuth(authorToken, adminsQuery, { first: 10 });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Admin access required');
        });
    });

    describe('Mutation: updateProfile', () => {
        const updateProfileMutation = `
            mutation($input: UpdateProfileInput!) {
                updateProfile(input: $input) {
                    id name bio profession
                }
            }
        `;

        it('should update own profile', async () => {
            // updateProfile query
            mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
            // findById after update
            mockQuery.mockResolvedValueOnce([[{
                ...mockAuthor, bio: 'Updated bio', profession: 'Editor',
            }]]);

            const res = await gqlAuth(authorToken, updateProfileMutation, {
                input: { bio: 'Updated bio', profession: 'Editor' },
            });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.updateProfile.bio).toBe('Updated bio');
            expect(res.body.data.updateProfile.profession).toBe('Editor');
        });

        it('should reject unauthenticated', async () => {
            const res = await gql(updateProfileMutation, {
                input: { bio: 'test' },
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Unauthorized access');
        });
    });

    describe('Mutation: adminUpdateUser', () => {
        const adminUpdateMutation = `
            mutation($id: Int!, $input: AdminUpdateUserInput!) {
                adminUpdateUser(id: $id, input: $input) {
                    id name bio
                }
            }
        `;

        it('should allow admin to update author', async () => {
            // findById to verify target
            mockQuery.mockResolvedValueOnce([[mockAuthor]]);
            // updateProfile query
            mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
            // findById after update
            mockQuery.mockResolvedValueOnce([[{ ...mockAuthor, bio: 'Admin updated' }]]);

            const res = await gqlAuth(adminToken, adminUpdateMutation, {
                id: 2, input: { bio: 'Admin updated' },
            });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.adminUpdateUser.bio).toBe('Admin updated');
        });

        it('should reject non-admin', async () => {
            const res = await gqlAuth(authorToken, adminUpdateMutation, {
                id: 2, input: { bio: 'test' },
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Admin access required');
        });

        it('should reject if target user not found', async () => {
            mockQuery.mockResolvedValueOnce([[]]);

            const res = await gqlAuth(adminToken, adminUpdateMutation, {
                id: 999, input: { bio: 'test' },
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('User not found');
        });

        it('should reject if target is admin', async () => {
            mockQuery.mockResolvedValueOnce([[mockAdmin]]);

            const res = await gqlAuth(adminToken, adminUpdateMutation, {
                id: 1, input: { bio: 'test' },
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('User is not an author');
        });
    });

    describe('Mutation: toggleUserStatus', () => {
        const toggleMutation = `
            mutation($id: Int!, $isActive: Boolean!) {
                toggleUserStatus(id: $id, isActive: $isActive) {
                    id is_active
                }
            }
        `;

        it('should allow admin to deactivate author', async () => {
            // findById to verify target
            mockQuery.mockResolvedValueOnce([[mockAuthor]]);
            // updateStatus query
            mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
            // findById after update
            mockQuery.mockResolvedValueOnce([[{ ...mockAuthor, is_active: false }]]);

            const res = await gqlAuth(adminToken, toggleMutation, {
                id: 2, isActive: false,
            });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.toggleUserStatus.is_active).toBe(false);
        });

        it('should allow admin to activate author', async () => {
            const inactiveAuthor = { ...mockAuthor, is_active: false };
            // findById to verify target
            mockQuery.mockResolvedValueOnce([[inactiveAuthor]]);
            // updateStatus query
            mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
            // findById after update
            mockQuery.mockResolvedValueOnce([[{ ...mockAuthor, is_active: true }]]);

            const res = await gqlAuth(adminToken, toggleMutation, {
                id: 2, isActive: true,
            });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.toggleUserStatus.is_active).toBe(true);
        });

        it('should reject non-admin', async () => {
            const res = await gqlAuth(authorToken, toggleMutation, {
                id: 2, isActive: false,
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Admin access required');
        });

        it('should reject if target is admin', async () => {
            mockQuery.mockResolvedValueOnce([[mockAdmin]]);

            const res = await gqlAuth(adminToken, toggleMutation, {
                id: 1, isActive: false,
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('User is not an author');
        });
    });
});
