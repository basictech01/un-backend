import { jest } from '@jest/globals';
import type { ApolloServer as ApolloServerType } from '@apollo/server';
import mysql from 'mysql2/promise';
import { GenericContainer } from 'testcontainers';

jest.setTimeout(120000);

// --- Real DB pool that points to testcontainer ---

let mockPool: any;
let container: any;

// Proxy delegates all property access/calls to mockPool at runtime.
// Direct getter doesn't work with jest.unstable_mockModule in ESM.
const poolProxy = new Proxy({} as any, {
    get(_target, prop) { return mockPool[prop]; },
});

jest.unstable_mockModule('../../database/db.ts', () => ({
    db: poolProxy,
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

const bcrypt = await import('bcrypt');
const { ApolloServer } = await import('@apollo/server');
const { expressMiddleware } = await import('@as-integrations/express5');
const express = await import('express');
const supertest = await import('supertest');
const { buildGraphQL } = await import('../../graphql/loaders/graphql.loader.ts');
const { optionalAuth } = await import('../../middleware/auth.middleware.ts');
const { createAuthToken } = await import('../../utils/jwt.ts');
const { createLoaders } = await import('../../graphql/loaders/user.loader.ts');

// --- DB setup/teardown helpers ---

const CREATE_USERS_TABLE = `
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        bio TEXT,
        profession VARCHAR(100),
        profile_photo VARCHAR(255),
        role ENUM('author','admin') NOT NULL DEFAULT 'author',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_role (role),
        INDEX idx_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

async function setupDatabase() {
    await mockPool.query(CREATE_USERS_TABLE);
}

async function tearDownDatabase() {
    await mockPool.query('DROP TABLE IF EXISTS users');
}

async function resetUsersTable() {
    const hash = await bcrypt.hash('password123', 10);
    await mockPool.query('DELETE FROM users');
    await mockPool.query(`ALTER TABLE users AUTO_INCREMENT = 1`);
    await mockPool.query(`
        INSERT INTO users (id, name, email, password_hash, bio, profession, profile_photo, role, is_active) VALUES
        (1, 'Admin User', 'admin@test.com', '${hash}', 'Platform admin', 'Administrator', NULL, 'admin', TRUE),
        (2, 'Author One', 'author1@test.com', '${hash}', 'Bio one', 'Writer', NULL, 'author', TRUE),
        (3, 'Author Two', 'author2@test.com', '${hash}', 'Bio two', 'Journalist', NULL, 'author', TRUE),
        (4, 'Inactive Author', 'inactive@test.com', '${hash}', NULL, NULL, NULL, 'author', FALSE),
        (5, 'Admin Two', 'admin2@test.com', '${hash}', NULL, NULL, NULL, 'admin', TRUE)
    `);
}

async function findUserById(id: number) {
    const [rows] = await mockPool.query('SELECT * FROM users WHERE id = ?', [id]);
    return (rows as any[])[0] || null;
}

// --- Test server setup ---

let app: any;
let apollo: ApolloServerType<any>;

const adminToken = createAuthToken({ userId: 1, email: 'admin@test.com', is_admin: true });
const authorToken = createAuthToken({ userId: 2, email: 'author1@test.com', is_admin: false });

beforeAll(async () => {
    container = await new GenericContainer('mysql:latest')
        .withExposedPorts(3306)
        .withEnvironment({
            MYSQL_ROOT_PASSWORD: 'root',
            MYSQL_DATABASE: 'test_db',
            MYSQL_USER: 'test_user',
            MYSQL_PASSWORD: 'test_password',
        })
        .start();

    const port = container.getMappedPort(3306);

    mockPool = mysql.createPool({
        host: 'localhost',
        user: 'test_user',
        password: 'test_password',
        database: 'test_db',
        port,
    });

    await setupDatabase();

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
    if (apollo) await apollo.stop();
    await tearDownDatabase();
    if (mockPool) await mockPool.end();
    if (container) await container.stop();
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

        beforeEach(async () => {
            await resetUsersTable();
        });

        it('should return paginated users for admin', async () => {
            const res = await gqlAuth(adminToken, usersQuery, { first: 10 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.users.edges).toHaveLength(5);
            expect(res.body.data.users.totalCount).toBe(5);
            expect(res.body.data.users.pageInfo.hasNextPage).toBe(false);
        });

        it('should paginate with first/after', async () => {
            const firstPage = await gqlAuth(adminToken, usersQuery, { first: 2 });

            expect(firstPage.body.data.users.edges).toHaveLength(2);
            expect(firstPage.body.data.users.pageInfo.hasNextPage).toBe(true);

            const endCursor = firstPage.body.data.users.pageInfo.endCursor;
            const secondPage = await gqlAuth(adminToken, usersQuery, { first: 2, after: endCursor });

            expect(secondPage.body.data.users.edges).toHaveLength(2);
            // IDs should continue after previous page
            const firstPageIds = firstPage.body.data.users.edges.map((e: any) => e.node.id);
            const secondPageIds = secondPage.body.data.users.edges.map((e: any) => e.node.id);
            expect(Math.min(...secondPageIds)).toBeGreaterThan(Math.max(...firstPageIds));
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
                    edges { cursor node { id name role is_active } }
                    pageInfo { hasNextPage }
                    totalCount
                }
            }
        `;

        beforeEach(async () => {
            await resetUsersTable();
        });

        it('should return only authors without auth', async () => {
            const res = await gql(authorsQuery, { first: 10 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();

            const edges = res.body.data.authors.edges;
            // Should only contain authors (3 authors in seed data)
            expect(edges).toHaveLength(3);
            edges.forEach((edge: any) => {
                expect(edge.node.role).toBe('author');
            });
            expect(res.body.data.authors.totalCount).toBe(3);
        });

        it('should filter authors with search', async () => {
            const res = await gql(`
                query {
                    authors(first: 10, filter: { search: "One" }) {
                        edges { node { id name } }
                        totalCount
                    }
                }
            `);

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.authors.edges).toHaveLength(1);
            expect(res.body.data.authors.edges[0].node.name).toBe('Author One');
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

        beforeEach(async () => {
            await resetUsersTable();
        });

        it('should return only admins for admin user', async () => {
            const res = await gqlAuth(adminToken, adminsQuery, { first: 10 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();

            const edges = res.body.data.admins.edges;
            expect(edges).toHaveLength(2);
            edges.forEach((edge: any) => {
                expect(edge.node.role).toBe('admin');
            });
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

        beforeEach(async () => {
            await resetUsersTable();
        });

        it('should update own profile', async () => {
            const res = await gqlAuth(authorToken, updateProfileMutation, {
                input: { bio: 'Updated bio', profession: 'Editor' },
            });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.updateProfile.bio).toBe('Updated bio');
            expect(res.body.data.updateProfile.profession).toBe('Editor');

            // Verify in DB
            const user = await findUserById(2);
            expect(user.bio).toBe('Updated bio');
            expect(user.profession).toBe('Editor');
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

        beforeEach(async () => {
            await resetUsersTable();
        });

        it('should allow admin to update author', async () => {
            const res = await gqlAuth(adminToken, adminUpdateMutation, {
                id: 2, input: { bio: 'Admin updated bio' },
            });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.adminUpdateUser.bio).toBe('Admin updated bio');

            // Verify in DB
            const user = await findUserById(2);
            expect(user.bio).toBe('Admin updated bio');
        });

        it('should reject non-admin', async () => {
            const res = await gqlAuth(authorToken, adminUpdateMutation, {
                id: 3, input: { bio: 'test' },
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Admin access required');
        });

        it('should reject if target user not found', async () => {
            const res = await gqlAuth(adminToken, adminUpdateMutation, {
                id: 999, input: { bio: 'test' },
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('User not found');
        });

        it('should reject if target is admin', async () => {
            const res = await gqlAuth(adminToken, adminUpdateMutation, {
                id: 5, input: { bio: 'test' },
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

        beforeEach(async () => {
            await resetUsersTable();
        });

        it('should allow admin to deactivate author', async () => {
            const res = await gqlAuth(adminToken, toggleMutation, {
                id: 2, isActive: false,
            });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.toggleUserStatus.is_active).toBe(false);

            // Verify in DB
            const user = await findUserById(2);
            expect(user.is_active).toBe(0); // MySQL returns 0/1 for booleans
        });

        it('should allow admin to activate author', async () => {
            const res = await gqlAuth(adminToken, toggleMutation, {
                id: 4, isActive: true,
            });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.toggleUserStatus.is_active).toBe(true);

            // Verify in DB
            const user = await findUserById(4);
            expect(user.is_active).toBe(1);
        });

        it('should reject non-admin', async () => {
            const res = await gqlAuth(authorToken, toggleMutation, {
                id: 3, isActive: false,
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Admin access required');
        });

        it('should reject if target is admin', async () => {
            const res = await gqlAuth(adminToken, toggleMutation, {
                id: 5, isActive: false,
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('User is not an author');
        });
    });
});
