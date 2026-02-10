import { jest } from '@jest/globals';
import type { ApolloServer as ApolloServerType } from '@apollo/server';
import mysql from 'mysql2/promise';
import { GenericContainer } from 'testcontainers';

jest.setTimeout(120000);

// --- Real DB pool that points to testcontainer ---

let mockPool: any;
let container: any;

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

const CREATE_ARTICLES_TABLE = `
    CREATE TABLE IF NOT EXISTS articles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        author_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        excerpt TEXT,
        content LONGTEXT NOT NULL,
        section VARCHAR(50) NOT NULL,
        subsections JSON NOT NULL,
        cover_image VARCHAR(255),
        status ENUM('draft','pending','approved','rejected') NOT NULL DEFAULT 'draft',
        rejection_reason TEXT,
        published_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_section (section),
        INDEX idx_status (status),
        INDEX idx_author (author_id),
        INDEX idx_published (published_at),
        INDEX idx_created (created_at),
        CONSTRAINT fk_articles_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const CREATE_ARTICLE_VIEWS_TABLE = `
    CREATE TABLE IF NOT EXISTS article_views (
        article_id INT PRIMARY KEY,
        views BIGINT NOT NULL DEFAULT 0,
        last_viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_views_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

async function setupDatabase() {
    await mockPool.query(CREATE_USERS_TABLE);
    await mockPool.query(CREATE_ARTICLES_TABLE);
    await mockPool.query(CREATE_ARTICLE_VIEWS_TABLE);
}

async function tearDownDatabase() {
    await mockPool.query('DROP TABLE IF EXISTS article_views');
    await mockPool.query('DROP TABLE IF EXISTS articles');
    await mockPool.query('DROP TABLE IF EXISTS users');
}

async function resetTables() {
    await mockPool.query('DELETE FROM article_views');
    await mockPool.query('DELETE FROM articles');
    await mockPool.query('DELETE FROM users');
    await mockPool.query('ALTER TABLE users AUTO_INCREMENT = 1');
    await mockPool.query('ALTER TABLE articles AUTO_INCREMENT = 1');

    // Seed users (password: password123 — not used for login in these tests)
    await mockPool.query(`
        INSERT INTO users (id, name, email, password_hash, bio, profession, profile_photo, role, is_active) VALUES
        (1, 'Admin User', 'admin@test.com', 'hash1', 'Platform admin', 'Administrator', NULL, 'admin', TRUE),
        (2, 'Author One', 'author1@test.com', 'hash2', 'Bio of Author One', 'Writer', 'photo1.jpg', 'author', TRUE),
        (3, 'Author Two', 'author2@test.com', 'hash3', 'Bio of Author Two', 'Journalist', NULL, 'author', TRUE)
    `);

    // Seed articles
    await mockPool.query(`
        INSERT INTO articles (id, author_id, title, excerpt, content, section, subsections, status, rejection_reason, published_at) VALUES
        (1, 2, 'Draft Article', 'Draft excerpt', 'Draft content', 'VOICES_AND_VISIONARIES', '["CHARISMA"]', 'draft', NULL, NULL),
        (2, 2, 'Pending Article', 'Pending excerpt', 'Pending content', 'LEARNING_AND_LADDERS', '["EDUCATION"]', 'pending', NULL, NULL),
        (3, 2, 'Approved Article', 'Approved excerpt', 'Approved content', 'GROWTH_AND_GRIT', '["ENDEAVOURS"]', 'approved', NULL, '2025-01-01 00:00:00'),
        (4, 3, 'Another Approved', NULL, 'Another approved content', 'NATURE_AND_NURTURE', '["NATURE"]', 'approved', NULL, '2025-01-02 00:00:00'),
        (5, 2, 'Rejected Article', 'Rejected excerpt', 'Rejected content', 'STATE_AND_STEWARDSHIP', '["GOVERNANCE"]', 'rejected', 'Needs more detail', NULL)
    `);

    // Seed views
    await mockPool.query(`
        INSERT INTO article_views (article_id, views) VALUES
        (3, 100),
        (4, 250)
    `);
}

async function findArticleById(id: number) {
    const [rows] = await mockPool.query('SELECT * FROM articles WHERE id = ?', [id]);
    return (rows as any[])[0] || null;
}

// --- Test server setup ---

let app: any;
let apollo: ApolloServerType<any>;

const adminToken = createAuthToken({ userId: 1, email: 'admin@test.com', is_admin: true });
const author1Token = createAuthToken({ userId: 2, email: 'author1@test.com', is_admin: false });
const author2Token = createAuthToken({ userId: 3, email: 'author2@test.com', is_admin: false });

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

describe('Article Management Integration', () => {

    // ========================================
    // Mutation: createArticle
    // ========================================
    describe('Mutation: createArticle', () => {
        const createMutation = `
            mutation($input: CreateArticleInput!) {
                createArticle(input: $input) {
                    id title content section subsections status published_at author_id
                    author { name bio profession }
                }
            }
        `;

        beforeEach(async () => { await resetTables(); });

        it('should create a draft article for author', async () => {
            const res = await gqlAuth(author1Token, createMutation, {
                input: {
                    title: 'New Post',
                    content: 'Content here',
                    section: 'VOICES_AND_VISIONARIES',
                    subsections: ['CHARISMA'],
                },
            });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.createArticle.status).toBe('draft');
            expect(res.body.data.createArticle.author_id).toBe(2);
            expect(res.body.data.createArticle.published_at).toBeNull();
            expect(res.body.data.createArticle.author.name).toBe('Author One');
        });

        it('should create an auto-approved article for admin', async () => {
            const res = await gqlAuth(adminToken, createMutation, {
                input: {
                    title: 'Admin Post',
                    content: 'Admin content',
                    section: 'GROWTH_AND_GRIT',
                    subsections: ['ENDEAVOURS'],
                },
            });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.createArticle.status).toBe('approved');
            expect(res.body.data.createArticle.published_at).not.toBeNull();
        });

        it('should reject invalid section', async () => {
            const res = await gqlAuth(author1Token, createMutation, {
                input: {
                    title: 'Bad Section',
                    content: 'Content',
                    section: 'INVALID_SECTION',
                    subsections: ['CHARISMA'],
                },
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toContain('Invalid section');
            expect(res.body.errors[0].message).toContain('INVALID_SECTION');
        });

        it('should reject invalid subsection for section', async () => {
            const res = await gqlAuth(author1Token, createMutation, {
                input: {
                    title: 'Bad Subsection',
                    content: 'Content',
                    section: 'VOICES_AND_VISIONARIES',
                    subsections: ['EDUCATION'], // belongs to LEARNING_AND_LADDERS
                },
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toContain('Invalid subsection for this section');
            expect(res.body.errors[0].message).toContain('EDUCATION');
        });

        it('should reject unauthenticated', async () => {
            const res = await gql(createMutation, {
                input: {
                    title: 'No Auth',
                    content: 'Content',
                    section: 'VOICES_AND_VISIONARIES',
                    subsections: ['CHARISMA'],
                },
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Unauthorized access');
        });
    });

    // ========================================
    // Mutation: updateArticle
    // ========================================
    describe('Mutation: updateArticle', () => {
        const updateMutation = `
            mutation($id: Int!, $input: UpdateArticleInput!) {
                updateArticle(id: $id, input: $input) {
                    id title content section
                }
            }
        `;

        beforeEach(async () => { await resetTables(); });

        it('should allow author to update own draft', async () => {
            const res = await gqlAuth(author1Token, updateMutation, {
                id: 1,
                input: { title: 'Updated Draft Title' },
            });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.updateArticle.title).toBe('Updated Draft Title');
        });

        it('should allow admin to update any article', async () => {
            const res = await gqlAuth(adminToken, updateMutation, {
                id: 3,
                input: { title: 'Admin Updated' },
            });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.updateArticle.title).toBe('Admin Updated');
        });

        it('should reject non-owner author', async () => {
            const res = await gqlAuth(author2Token, updateMutation, {
                id: 1, // owned by author1
                input: { title: 'Hacked' },
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('You do not own this article');
        });

        it('should reject author updating approved article', async () => {
            const res = await gqlAuth(author1Token, updateMutation, {
                id: 3, // approved
                input: { title: 'Cannot Update' },
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Article can only be edited in draft or rejected status');
        });

        it('should validate section if provided', async () => {
            const res = await gqlAuth(author1Token, updateMutation, {
                id: 1,
                input: { section: 'INVALID' },
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toContain('Invalid section');
            expect(res.body.errors[0].message).toContain('INVALID');
        });
    });

    // ========================================
    // Mutation: submitArticle
    // ========================================
    describe('Mutation: submitArticle', () => {
        const submitMutation = `
            mutation($id: Int!) {
                submitArticle(id: $id) { id status }
            }
        `;

        beforeEach(async () => { await resetTables(); });

        it('should transition draft to pending', async () => {
            const res = await gqlAuth(author1Token, submitMutation, { id: 1 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.submitArticle.status).toBe('pending');
        });

        it('should reject already pending article', async () => {
            const res = await gqlAuth(author1Token, submitMutation, { id: 2 }); // pending

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Article is already pending review');
        });

        it('should reject non-owner', async () => {
            const res = await gqlAuth(author2Token, submitMutation, { id: 1 }); // owned by author1

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('You do not own this article');
        });
    });

    // ========================================
    // Mutation: approveArticle
    // ========================================
    describe('Mutation: approveArticle', () => {
        const approveMutation = `
            mutation($id: Int!) {
                approveArticle(id: $id) { id status published_at }
            }
        `;

        beforeEach(async () => { await resetTables(); });

        it('should approve pending article', async () => {
            const res = await gqlAuth(adminToken, approveMutation, { id: 2 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.approveArticle.status).toBe('approved');
            expect(res.body.data.approveArticle.published_at).not.toBeNull();
        });

        it('should reject non-admin', async () => {
            const res = await gqlAuth(author1Token, approveMutation, { id: 2 });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Admin access required');
        });

        it('should reject non-pending article', async () => {
            const res = await gqlAuth(adminToken, approveMutation, { id: 1 }); // draft

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Article is not pending approval');
        });
    });

    // ========================================
    // Mutation: rejectArticle
    // ========================================
    describe('Mutation: rejectArticle', () => {
        const rejectMutation = `
            mutation($id: Int!, $reason: String!) {
                rejectArticle(id: $id, reason: $reason) { id status rejection_reason }
            }
        `;

        beforeEach(async () => { await resetTables(); });

        it('should reject pending article with reason', async () => {
            const res = await gqlAuth(adminToken, rejectMutation, {
                id: 2,
                reason: 'Needs more research',
            });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.rejectArticle.status).toBe('rejected');
            expect(res.body.data.rejectArticle.rejection_reason).toBe('Needs more research');
        });

        it('should reject non-admin', async () => {
            const res = await gqlAuth(author1Token, rejectMutation, {
                id: 2,
                reason: 'Bad',
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Admin access required');
        });

        it('should reject non-pending article', async () => {
            const res = await gqlAuth(adminToken, rejectMutation, {
                id: 1, // draft
                reason: 'Not valid',
            });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Article is not pending approval');
        });
    });

    // ========================================
    // Mutation: resubmitArticle
    // ========================================
    describe('Mutation: resubmitArticle', () => {
        const resubmitMutation = `
            mutation($id: Int!) {
                resubmitArticle(id: $id) { id status rejection_reason }
            }
        `;

        beforeEach(async () => { await resetTables(); });

        it('should transition rejected to pending and clear reason', async () => {
            const res = await gqlAuth(author1Token, resubmitMutation, { id: 5 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.resubmitArticle.status).toBe('pending');
            expect(res.body.data.resubmitArticle.rejection_reason).toBeNull();
        });

        it('should reject non-rejected article', async () => {
            const res = await gqlAuth(author1Token, resubmitMutation, { id: 1 }); // draft

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Article must be rejected to resubmit');
        });

        it('should reject non-owner', async () => {
            const res = await gqlAuth(author2Token, resubmitMutation, { id: 5 }); // owned by author1 (id=2)

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('You do not own this article');
        });
    });

    // ========================================
    // Mutation: deleteArticle
    // ========================================
    describe('Mutation: deleteArticle', () => {
        const deleteMutation = `
            mutation($id: Int!) {
                deleteArticle(id: $id) { id title }
            }
        `;

        beforeEach(async () => { await resetTables(); });

        it('should allow author to delete own draft', async () => {
            const res = await gqlAuth(author1Token, deleteMutation, { id: 1 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.deleteArticle.id).toBe(1);

            // Verify deleted
            const dbArticle = await findArticleById(1);
            expect(dbArticle).toBeNull();
        });

        it('should allow admin to delete any article', async () => {
            const res = await gqlAuth(adminToken, deleteMutation, { id: 3 }); // approved

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
        });

        it('should reject author deleting non-draft', async () => {
            const res = await gqlAuth(author1Token, deleteMutation, { id: 3 }); // approved

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Authors can only delete their own draft articles');
        });

        it('should reject non-owner', async () => {
            const res = await gqlAuth(author2Token, deleteMutation, { id: 1 }); // owned by author1

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('You do not own this article');
        });
    });

    // ========================================
    // Mutation: bulkApproveArticles
    // ========================================
    describe('Mutation: bulkApproveArticles', () => {
        const bulkApproveMutation = `
            mutation($ids: [Int!]!) {
                bulkApproveArticles(ids: $ids)
            }
        `;

        beforeEach(async () => { await resetTables(); });

        it('should bulk approve articles for admin', async () => {
            const res = await gqlAuth(adminToken, bulkApproveMutation, { ids: [2] });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.bulkApproveArticles).toBe(true);

            const dbArticle = await findArticleById(2);
            expect(dbArticle.status).toBe('approved');
        });

        it('should reject non-admin', async () => {
            const res = await gqlAuth(author1Token, bulkApproveMutation, { ids: [2] });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Admin access required');
        });
    });

    // ========================================
    // Mutation: bulkDeleteArticles
    // ========================================
    describe('Mutation: bulkDeleteArticles', () => {
        const bulkDeleteMutation = `
            mutation($ids: [Int!]!) {
                bulkDeleteArticles(ids: $ids)
            }
        `;

        beforeEach(async () => { await resetTables(); });

        it('should bulk delete articles for admin', async () => {
            const res = await gqlAuth(adminToken, bulkDeleteMutation, { ids: [1, 2] });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.bulkDeleteArticles).toBe(true);

            expect(await findArticleById(1)).toBeNull();
            expect(await findArticleById(2)).toBeNull();
        });

        it('should reject non-admin', async () => {
            const res = await gqlAuth(author1Token, bulkDeleteMutation, { ids: [1] });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Admin access required');
        });
    });

    // ========================================
    // Query: approvedArticles
    // ========================================
    describe('Query: approvedArticles', () => {
        const approvedQuery = `
            query($first: Int, $after: String, $filter: ArticleFilter) {
                approvedArticles(first: $first, after: $after, filter: $filter) {
                    edges { cursor node { id title section status author { name bio profession } } }
                    pageInfo { startCursor endCursor hasNextPage }
                    totalCount
                }
            }
        `;

        beforeEach(async () => { await resetTables(); });

        it('should return approved articles with author info publicly', async () => {
            const res = await gql(approvedQuery, { first: 10 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.approvedArticles.edges).toHaveLength(2);
            expect(res.body.data.approvedArticles.totalCount).toBe(2);
            // Verify author info present
            res.body.data.approvedArticles.edges.forEach((e: any) => {
                expect(e.node.author.name).toBeDefined();
            });
        });

        it('should filter by section', async () => {
            const res = await gql(approvedQuery, {
                first: 10,
                filter: { section: 'GROWTH_AND_GRIT' },
            });

            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.approvedArticles.edges).toHaveLength(1);
            expect(res.body.data.approvedArticles.edges[0].node.section).toBe('GROWTH_AND_GRIT');
        });

        it('should filter by search (title)', async () => {
            const res = await gql(approvedQuery, {
                first: 10,
                filter: { search: 'Another' },
            });

            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.approvedArticles.edges).toHaveLength(1);
            expect(res.body.data.approvedArticles.edges[0].node.title).toBe('Another Approved');
        });

        it('should filter by search (author name)', async () => {
            const res = await gql(approvedQuery, {
                first: 10,
                filter: { search: 'Author Two' },
            });

            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.approvedArticles.edges).toHaveLength(1);
            expect(res.body.data.approvedArticles.edges[0].node.author.name).toBe('Author Two');
        });

        it('should filter by search (section name)', async () => {
            const res = await gql(approvedQuery, {
                first: 10,
                filter: { search: 'NATURE_AND_NURTURE' },
            });

            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.approvedArticles.edges).toHaveLength(1);
            expect(res.body.data.approvedArticles.edges[0].node.section).toBe('NATURE_AND_NURTURE');
        });

        it('should filter by search (subsection in JSON)', async () => {
            const res = await gql(approvedQuery, {
                first: 10,
                filter: { search: 'ENDEAVOURS' },
            });

            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.approvedArticles.edges).toHaveLength(1);
            expect(res.body.data.approvedArticles.edges[0].node.id).toBe(3);
        });
    });

    // ========================================
    // Query: myArticles
    // ========================================
    describe('Query: myArticles', () => {
        const myArticlesQuery = `
            query($first: Int) {
                myArticles(first: $first) {
                    edges { node { id title status } }
                    totalCount
                }
            }
        `;

        beforeEach(async () => { await resetTables(); });

        it('should return all statuses for current user', async () => {
            const res = await gqlAuth(author1Token, myArticlesQuery, { first: 10 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            // Author1 (id=2) has articles 1 (draft), 2 (pending), 3 (approved), 5 (rejected)
            expect(res.body.data.myArticles.edges).toHaveLength(4);
            expect(res.body.data.myArticles.totalCount).toBe(4);
        });

        it('should reject unauthenticated', async () => {
            const res = await gql(myArticlesQuery, { first: 10 });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Unauthorized access');
        });
    });

    // ========================================
    // Query: pendingArticles
    // ========================================
    describe('Query: pendingArticles', () => {
        const pendingQuery = `
            query($first: Int) {
                pendingArticles(first: $first) {
                    edges { node { id title status } }
                    totalCount
                }
            }
        `;

        beforeEach(async () => { await resetTables(); });

        it('should return only pending for admin', async () => {
            const res = await gqlAuth(adminToken, pendingQuery, { first: 10 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.pendingArticles.edges).toHaveLength(1);
            expect(res.body.data.pendingArticles.edges[0].node.status).toBe('pending');
        });

        it('should reject non-admin', async () => {
            const res = await gqlAuth(author1Token, pendingQuery, { first: 10 });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Admin access required');
        });
    });

    // ========================================
    // Query: article (single)
    // ========================================
    describe('Query: article', () => {
        const articleQuery = `
            query($id: Int!) {
                article(id: $id) {
                    id title status
                    author { name bio profession profile_photo }
                }
            }
        `;

        beforeEach(async () => { await resetTables(); });

        it('should return approved article with author info publicly', async () => {
            const res = await gql(articleQuery, { id: 3 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.article.title).toBe('Approved Article');
            expect(res.body.data.article.author.name).toBe('Author One');
            expect(res.body.data.article.author.bio).toBe('Bio of Author One');
            expect(res.body.data.article.author.profession).toBe('Writer');
            expect(res.body.data.article.author.profile_photo).toBe('photo1.jpg');
        });

        it('should return author info for different author', async () => {
            const res = await gql(articleQuery, { id: 4 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.article.author.name).toBe('Author Two');
            expect(res.body.data.article.author.profession).toBe('Journalist');
            expect(res.body.data.article.author.profile_photo).toBeNull();
        });

        it('should not return non-approved article', async () => {
            const res = await gql(articleQuery, { id: 1 }); // draft

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Article not found');
        });

        it('should return 404 for non-existent article', async () => {
            const res = await gql(articleQuery, { id: 999 });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Article not found');
        });
    });

    // ========================================
    // Query: trendingArticles
    // ========================================
    describe('Query: trendingArticles', () => {
        const trendingQuery = `
            query($first: Int) {
                trendingArticles(first: $first) {
                    edges { node { id title author { name profession } } }
                    totalCount
                }
            }
        `;

        beforeEach(async () => { await resetTables(); });

        it('should return articles ordered by views with author info', async () => {
            const res = await gql(trendingQuery, { first: 10 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            const edges = res.body.data.trendingArticles.edges;
            expect(edges).toHaveLength(2);
            // Article 4 has 250 views, article 3 has 100
            expect(edges[0].node.id).toBe(4);
            expect(edges[0].node.author.name).toBe('Author Two');
            expect(edges[1].node.id).toBe(3);
            expect(edges[1].node.author.name).toBe('Author One');
        });
    });

    // ========================================
    // Mutation: incrementViews
    // ========================================
    describe('Mutation: incrementViews', () => {
        const incrementMutation = `
            mutation($id: Int!) {
                incrementViews(id: $id)
            }
        `;

        beforeEach(async () => { await resetTables(); });

        it('should increment view count', async () => {
            const res = await gql(incrementMutation, { id: 3 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.incrementViews).toBe(true);

            // Verify in DB
            const [rows] = await mockPool.query('SELECT views FROM article_views WHERE article_id = 3');
            expect(Number((rows as any[])[0].views)).toBe(101);
        });
    });

    // ========================================
    // Query: articles (admin, all non-draft)
    // ========================================
    describe('Query: articles (admin)', () => {
        const articlesQuery = `
            query($first: Int, $filter: ArticleFilter) {
                articles(first: $first, filter: $filter) {
                    edges { node { id title status } }
                    totalCount
                }
            }
        `;

        beforeEach(async () => { await resetTables(); });

        it('should return all non-draft articles for admin', async () => {
            const res = await gqlAuth(adminToken, articlesQuery, { first: 10 });

            expect(res.status).toBe(200);
            expect(res.body.errors).toBeUndefined();
            // 5 articles minus 1 draft = 4
            expect(res.body.data.articles.edges).toHaveLength(4);
        });

        it('should filter by status', async () => {
            const res = await gqlAuth(adminToken, articlesQuery, {
                first: 10,
                filter: { status: 'APPROVED' },
            });

            expect(res.body.errors).toBeUndefined();
            expect(res.body.data.articles.edges).toHaveLength(2);
            res.body.data.articles.edges.forEach((e: any) => {
                expect(e.node.status).toBe('approved');
            });
        });

        it('should reject non-admin', async () => {
            const res = await gqlAuth(author1Token, articlesQuery, { first: 10 });

            expect(res.body.errors).toBeDefined();
            expect(res.body.errors[0].message).toBe('Admin access required');
        });
    });
});
