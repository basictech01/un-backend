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

const bcrypt = await import('bcrypt');
const { ApolloServer } = await import('@apollo/server');
const { expressMiddleware } = await import('@as-integrations/express5');
const express = await import('express');
const supertest = await import('supertest');
const { buildGraphQL } = await import('../../graphql/loaders/graphql.loader.ts');
const { optionalAuth } = await import('../../middleware/auth.middleware.ts');
const { createAuthToken, createRefreshToken } = await import('../../utils/jwt.ts');
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

// --- Helper ---

function gql(query: string, variables?: Record<string, any>) {
    return supertest.default(app)
        .post('/graphql')
        .send({ query, variables });
}

// --- Tests ---

describe('Auth Integration', () => {
    describe('Mutation: signup', () => {
        it('should create a new user and return tokens', async () => {
            mockQuery.mockResolvedValueOnce([[]]);
            mockQuery.mockResolvedValueOnce([{ insertId: 1 }]);
            mockQuery.mockResolvedValueOnce([[{
                id: 1, name: 'Test User', email: 'test@test.com',
                bio: null, profession: null, profile_photo: null,
                role: 'author', is_active: true, created_at: new Date().toISOString(),
            }]]);

            const res = await gql(`
                mutation {
                    signup(input: { name: "Test User", email: "test@test.com", password: "password123" }) {
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
            expect(res.body.data.signup.user.name).toBe('Test User');
            expect(res.body.data.signup.user.email).toBe('test@test.com');
        });

        it('should reject duplicate email', async () => {
            mockQuery.mockResolvedValueOnce([[{ id: 1, email: 'test@test.com' }]]);

            const res = await gql(`
                mutation {
                    signup(input: { name: "Test", email: "test@test.com", password: "password123" }) {
                        token
                    }
                }
            `);

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Email already exists');
        });
    });

    describe('Mutation: login', () => {
        it('should login with valid credentials', async () => {
            const hash = await bcrypt.hash('password123', 12);
            mockQuery.mockResolvedValueOnce([[{
                id: 1, name: 'Test User', email: 'test@test.com',
                password_hash: hash, bio: null, profession: null,
                profile_photo: null, role: 'author', is_active: true,
                created_at: new Date().toISOString(),
            }]]);

            const res = await gql(`
                mutation {
                    login(input: { email: "test@test.com", password: "password123" }) {
                        token
                        refreshToken
                        user { id name email }
                    }
                }
            `);

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.login.token).toBeDefined();
            expect(res.body.data.login.user.email).toBe('test@test.com');
        });

        it('should reject invalid password', async () => {
            const hash = await bcrypt.hash('correctpassword', 12);
            mockQuery.mockResolvedValueOnce([[{
                id: 1, email: 'test@test.com', password_hash: hash,
                is_active: true, role: 'author',
            }]]);

            const res = await gql(`
                mutation {
                    login(input: { email: "test@test.com", password: "wrongpassword" }) {
                        token
                    }
                }
            `);

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Invalid email or password');
        });

        it('should reject inactive user', async () => {
            const hash = await bcrypt.hash('password123', 12);
            mockQuery.mockResolvedValueOnce([[{
                id: 1, email: 'test@test.com', password_hash: hash,
                is_active: false, role: 'author',
            }]]);

            const res = await gql(`
                mutation {
                    login(input: { email: "test@test.com", password: "password123" }) {
                        token
                    }
                }
            `);

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Access forbidden');
        });
    });

    describe('Query: me', () => {
        it('should return current user when authenticated', async () => {
            const token = createAuthToken({ userId: 1, email: 'test@test.com', is_admin: false });

            mockQuery.mockResolvedValueOnce([[{
                id: 1, name: 'Test User', email: 'test@test.com',
                bio: 'A bio', profession: 'Dev', profile_photo: null,
                role: 'author', is_active: true, created_at: new Date().toISOString(),
            }]]);

            const res = await supertest.default(app)
                .post('/graphql')
                .set('Authorization', `Bearer ${token}`)
                .send({ query: '{ me { id name email bio profession } }' });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.me.name).toBe('Test User');
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
            const refreshToken = createRefreshToken({ userId: 1, email: 'test@test.com', is_admin: false });

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
