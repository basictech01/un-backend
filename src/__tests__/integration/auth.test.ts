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
    AZURE_STORAGE_CONNECTION_STRING: '',
    AZURE_CONTAINER_NAME: 'test-images',
    FILE_CREATION_SECRET_KEY: 'test-secret',
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
const { createAuthToken, createRefreshToken } = await import('../../utils/jwt.ts');
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
    await mockPool.query(`
        INSERT INTO users (id, name, email, password_hash, bio, profession, profile_photo, role, is_active) VALUES
        (1, 'Admin User', 'admin@test.com', '${hash}', 'Platform admin', 'Administrator', NULL, 'admin', TRUE),
        (2, 'Author User', 'author@test.com', '${hash}', 'A bio', 'Writer', NULL, 'author', TRUE),
        (3, 'Inactive Author', 'inactive@test.com', '${hash}', NULL, NULL, NULL, 'author', FALSE)
    `);
}

// --- Test server setup ---

let app: any;
let apollo: ApolloServerType<any>;

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

// --- Helper ---

function gql(query: string, variables?: Record<string, any>) {
    return supertest.default(app)
        .post('/graphql')
        .send({ query, variables });
}

// --- Tests ---

describe('Auth Integration', () => {
    describe('Mutation: signup', () => {
        beforeEach(async () => {
            await resetUsersTable();
        });

        it('should create a new user and return tokens', async () => {
            const res = await gql(`
                mutation {
                    signup(input: { name: "New User", email: "new@test.com", password: "password123" }) {
                        token
                        refreshToken
                        user { id name email role }
                    }
                }
            `);

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.signup.token).toBeDefined();
            expect(res.body.data.signup.refreshToken).toBeDefined();
            expect(res.body.data.signup.user.name).toBe('New User');
            expect(res.body.data.signup.user.email).toBe('new@test.com');
            expect(res.body.data.signup.user.role).toBe('author');

            // Verify user actually exists in DB
            const [rows] = await mockPool.query('SELECT * FROM users WHERE email = ?', ['new@test.com']);
            expect(rows).toHaveLength(1);
            expect(rows[0].name).toBe('New User');
        });

        it('should reject duplicate email', async () => {
            const res = await gql(`
                mutation {
                    signup(input: { name: "Test", email: "author@test.com", password: "password123" }) {
                        token
                    }
                }
            `);

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Email already exists');
        });
    });

    describe('Mutation: login', () => {
        beforeEach(async () => {
            await resetUsersTable();
        });

        it('should login with valid credentials', async () => {
            const res = await gql(`
                mutation {
                    login(input: { email: "author@test.com", password: "password123" }) {
                        token
                        refreshToken
                        user { id name email }
                    }
                }
            `);

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.login.token).toBeDefined();
            expect(res.body.data.login.user.email).toBe('author@test.com');
        });

        it('should reject invalid password', async () => {
            const res = await gql(`
                mutation {
                    login(input: { email: "author@test.com", password: "wrongpassword" }) {
                        token
                    }
                }
            `);

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Invalid email or password');
        });

        it('should reject inactive user', async () => {
            const res = await gql(`
                mutation {
                    login(input: { email: "inactive@test.com", password: "password123" }) {
                        token
                    }
                }
            `);

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Your account has been deactivated. Please contact an administrator.');
        });
    });

    describe('Query: me', () => {
        beforeEach(async () => {
            await resetUsersTable();
        });

        it('should return current user when authenticated', async () => {
            const token = createAuthToken({ userId: 2, email: 'author@test.com', is_admin: false });

            const res = await supertest.default(app)
                .post('/graphql')
                .set('Authorization', `Bearer ${token}`)
                .send({ query: '{ me { id name email bio profession } }' });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.me.name).toBe('Author User');
            expect(res.body.data.me.bio).toBe('A bio');
        });

        it('should reject unauthenticated request', async () => {
            const res = await gql('{ me { id name } }');

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Unauthorized access');
        });
    });

    describe('Mutation: refreshToken', () => {
        it('should return new auth token from valid refresh token', async () => {
            const refreshToken = createRefreshToken({ userId: 1, email: 'admin@test.com', is_admin: true });

            const res = await gql(`
                mutation {
                    refreshToken(token: "${refreshToken}") {
                        token
                    }
                }
            `);

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.refreshToken.token).toBeDefined();
        });

        it('should reject invalid refresh token', async () => {
            const res = await gql(`
                mutation {
                    refreshToken(token: "invalid-token") {
                        token
                    }
                }
            `);

            expect(res.body.errors).toBeDefined();
        });
    });
});
