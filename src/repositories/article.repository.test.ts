import { jest } from '@jest/globals';
import mysql from 'mysql2/promise';
import { GenericContainer } from 'testcontainers';

jest.setTimeout(120000);


let mockPool: any;
let container: any;

const poolProxy = new Proxy({} as any, {
    get(_target, prop) { return mockPool[prop]; },
});

jest.unstable_mockModule('../database/db.ts', () => ({
    db: poolProxy,
    connectToDatabase: jest.fn(),
}));

jest.unstable_mockModule('../config/env.ts', () => ({
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

jest.unstable_mockModule('../utils/logger.ts', () => ({
    default: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    }),
}));

const { articleRepository } = await import('./article.repository.ts');

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

    // Seed users
    await mockPool.query(`
        INSERT INTO users (id, name, email, password_hash, bio, profession, profile_photo, role, is_active) VALUES
        (1, 'Admin User', 'admin@test.com', 'hash1', 'Platform admin', 'Administrator', NULL, 'admin', TRUE),
        (2, 'Author One', 'author1@test.com', 'hash2', 'Bio of Author One', 'Writer', 'photo1.jpg', 'author', TRUE),
        (3, 'Author Two', 'author2@test.com', 'hash3', 'Bio of Author Two', 'Journalist', NULL, 'author', TRUE)
    `);

    // Seed articles (mix of statuses)
    await mockPool.query(`
        INSERT INTO articles (id, author_id, title, excerpt, content, section, subsections, status, rejection_reason, published_at) VALUES
        (1, 2, 'Draft Article', 'Draft excerpt', 'Draft content here', 'VOICES_AND_VISIONARIES', '["CHARISMA"]', 'draft', NULL, NULL),
        (2, 2, 'Pending Article', 'Pending excerpt', 'Pending content here', 'LEARNING_AND_LADDERS', '["EDUCATION","APTITUDE"]', 'pending', NULL, NULL),
        (3, 2, 'Approved Article One', 'Approved excerpt', 'Approved content here', 'GROWTH_AND_GRIT', '["ENDEAVOURS"]', 'approved', NULL, '2025-01-01 00:00:00'),
        (4, 3, 'Approved Article Two', NULL, 'Another approved content', 'NATURE_AND_NURTURE', '["NATURE"]', 'approved', NULL, '2025-01-02 00:00:00'),
        (5, 3, 'Rejected Article', 'Rejected excerpt', 'Rejected content here', 'STATE_AND_STEWARDSHIP', '["GOVERNANCE"]', 'rejected', 'Needs more detail', NULL),
        (6, 2, 'Another Draft', NULL, 'Another draft content', 'SPIRIT_AND_STORY', '["ODYSSEY","MOORINGS"]', 'draft', NULL, NULL)
    `);

    // Seed some views
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

async function findViewById(articleId: number) {
    const [rows] = await mockPool.query('SELECT * FROM article_views WHERE article_id = ?', [articleId]);
    return (rows as any[])[0] || null;
}

// --- Container lifecycle ---

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
});

afterAll(async () => {
    await tearDownDatabase();
    if (mockPool) await mockPool.end();
    if (container) await container.stop();
});

// --- Tests ---

describe('ArticleRepository', () => {
    beforeEach(async () => {
        await resetTables();
    });

    describe('create', () => {
        it('should insert a new article and return it', async () => {
            const result = await articleRepository.create({
                authorId: 2,
                title: 'New Article',
                excerpt: 'New excerpt',
                content: 'New content',
                section: 'VOICES_AND_VISIONARIES',
                subsections: ['CHARISMA', 'ACCOLADES'],
                coverImage: 'image.jpg',
                status: 'draft',
            });

            expect(result.isOk()).toBe(true);
            const article = result._unsafeUnwrap();
            expect(article.title).toBe('New Article');
            expect(article.section).toBe('VOICES_AND_VISIONARIES');
            expect(article.status).toBe('draft');
            expect(article.author_id).toBe(2);

            // Verify JSON subsections in DB
            const dbArticle = await findArticleById(article.id);
            const subsections = typeof dbArticle.subsections === 'string'
                ? JSON.parse(dbArticle.subsections) : dbArticle.subsections;
            expect(subsections).toEqual(['CHARISMA', 'ACCOLADES']);
        });

        it('should set published_at when status is approved', async () => {
            const result = await articleRepository.create({
                authorId: 2,
                title: 'Auto-approved',
                content: 'Content',
                section: 'GROWTH_AND_GRIT',
                subsections: ['ENDEAVOURS'],
                status: 'approved',
            });

            expect(result.isOk()).toBe(true);
            const article = result._unsafeUnwrap();
            expect(article.published_at).not.toBeNull();
        });
    });

    describe('findById', () => {
        it('should return article when found', async () => {
            const result = await articleRepository.findById(1);
            expect(result.isOk()).toBe(true);
            const article = result._unsafeUnwrap();
            expect(article).not.toBeNull();
            expect(article!.title).toBe('Draft Article');
            expect(article!.author_id).toBe(2);
        });

        it('should return article for different author', async () => {
            const result = await articleRepository.findById(4);
            expect(result.isOk()).toBe(true);
            const article = result._unsafeUnwrap();
            expect(article).not.toBeNull();
            expect(article!.author_id).toBe(3);
        });

        it('should return null when not found', async () => {
            const result = await articleRepository.findById(999);
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBeNull();
        });
    });

    describe('update', () => {
        it('should update partial fields', async () => {
            const result = await articleRepository.update(1, { title: 'Updated Title' });
            expect(result.isOk()).toBe(true);

            const dbArticle = await findArticleById(1);
            expect(dbArticle.title).toBe('Updated Title');
            expect(dbArticle.content).toBe('Draft content here'); // unchanged
        });

        it('should update all fields', async () => {
            const result = await articleRepository.update(1, {
                title: 'New Title',
                excerpt: 'New Excerpt',
                content: 'New Content',
                section: 'NATURE_AND_NURTURE',
                subsections: ['WELLNESS'],
                coverImage: 'new-cover.jpg',
            });
            expect(result.isOk()).toBe(true);

            const dbArticle = await findArticleById(1);
            expect(dbArticle.title).toBe('New Title');
            expect(dbArticle.excerpt).toBe('New Excerpt');
            expect(dbArticle.content).toBe('New Content');
            expect(dbArticle.section).toBe('NATURE_AND_NURTURE');
            const subs = typeof dbArticle.subsections === 'string'
                ? JSON.parse(dbArticle.subsections) : dbArticle.subsections;
            expect(subs).toEqual(['WELLNESS']);
            expect(dbArticle.cover_image).toBe('new-cover.jpg');
        });

        it('should do nothing when no fields provided', async () => {
            const result = await articleRepository.update(1, {});
            expect(result.isOk()).toBe(true);

            const dbArticle = await findArticleById(1);
            expect(dbArticle.title).toBe('Draft Article'); // unchanged
        });
    });

    describe('updateStatus', () => {
        it('should approve article and set published_at', async () => {
            const result = await articleRepository.updateStatus(2, 'approved');
            expect(result.isOk()).toBe(true);

            const dbArticle = await findArticleById(2);
            expect(dbArticle.status).toBe('approved');
            expect(dbArticle.published_at).not.toBeNull();
        });

        it('should reject article with reason', async () => {
            const result = await articleRepository.updateStatus(2, 'rejected', 'Not good enough');
            expect(result.isOk()).toBe(true);

            const dbArticle = await findArticleById(2);
            expect(dbArticle.status).toBe('rejected');
            expect(dbArticle.rejection_reason).toBe('Not good enough');
        });

        it('should submit article (draft to pending)', async () => {
            const result = await articleRepository.updateStatus(1, 'pending');
            expect(result.isOk()).toBe(true);

            const dbArticle = await findArticleById(1);
            expect(dbArticle.status).toBe('pending');
        });
    });

    describe('delete', () => {
        it('should delete article from DB', async () => {
            const result = await articleRepository.delete(1);
            expect(result.isOk()).toBe(true);

            const dbArticle = await findArticleById(1);
            expect(dbArticle).toBeNull();
        });
    });

    describe('bulkUpdateStatus', () => {
        it('should approve multiple pending articles', async () => {
            // First make article 1 pending
            await mockPool.query("UPDATE articles SET status = 'pending' WHERE id = 1");

            const result = await articleRepository.bulkUpdateStatus([1, 2], 'approved', new Date());
            expect(result.isOk()).toBe(true);

            const a1 = await findArticleById(1);
            const a2 = await findArticleById(2);
            expect(a1.status).toBe('approved');
            expect(a2.status).toBe('approved');
            expect(a1.published_at).not.toBeNull();
            expect(a2.published_at).not.toBeNull();
        });
    });

    describe('bulkDelete', () => {
        it('should delete multiple articles', async () => {
            const result = await articleRepository.bulkDelete([1, 6]);
            expect(result.isOk()).toBe(true);

            const a1 = await findArticleById(1);
            const a6 = await findArticleById(6);
            expect(a1).toBeNull();
            expect(a6).toBeNull();

            // Other articles still exist
            const a2 = await findArticleById(2);
            expect(a2).not.toBeNull();
        });
    });

    describe('findPaginated', () => {
        it('should return paginated articles excluding drafts', async () => {
            const result = await articleRepository.findPaginated({ first: 10 });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            // Should exclude 2 drafts (articles 1 and 6)
            expect(data.articles).toHaveLength(4);
            data.articles.forEach((a: any) => {
                expect(a.status).not.toBe('draft');
            });
        });

        it('should support cursor pagination', async () => {
            const firstPage = await articleRepository.findPaginated({ first: 2 });
            expect(firstPage.isOk()).toBe(true);
            const firstData = firstPage._unsafeUnwrap();
            expect(firstData.articles).toHaveLength(2);
            expect(firstData.hasMore).toBe(true);
        });

        it('should filter by status', async () => {
            const result = await articleRepository.findPaginated({ first: 10 }, { status: 'approved' });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.articles).toHaveLength(2);
            data.articles.forEach((a: any) => expect(a.status).toBe('approved'));
        });

        it('should filter by section', async () => {
            const result = await articleRepository.findPaginated({ first: 10 }, { section: 'GROWTH_AND_GRIT' });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.articles).toHaveLength(1);
            expect(data.articles[0].section).toBe('GROWTH_AND_GRIT');
        });

        it('should filter by author', async () => {
            const result = await articleRepository.findPaginated({ first: 10 }, { authorId: 3 });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            // Author 3 has articles 4 (approved) and 5 (rejected) — both non-draft
            expect(data.articles).toHaveLength(2);
            data.articles.forEach((a: any) => expect(a.author_id).toBe(3));
        });

        it('should filter by search (title)', async () => {
            const result = await articleRepository.findPaginated({ first: 10 }, { search: 'Pending' });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.articles).toHaveLength(1);
            expect(data.articles[0].title).toBe('Pending Article');
        });

        it('should filter by search (author name)', async () => {
            const result = await articleRepository.findPaginated({ first: 10 }, { search: 'Author Two' });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            // Author Two has articles 4 (approved) and 5 (rejected) — both non-draft
            expect(data.articles).toHaveLength(2);
            data.articles.forEach((a: any) => expect(a.author_id).toBe(3));
        });

        it('should filter by search (section name)', async () => {
            const result = await articleRepository.findPaginated({ first: 10 }, { search: 'GROWTH_AND_GRIT' });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.articles).toHaveLength(1);
            expect(data.articles[0].section).toBe('GROWTH_AND_GRIT');
        });

        it('should filter by search (subsection in JSON)', async () => {
            const result = await articleRepository.findPaginated({ first: 10 }, { search: 'GOVERNANCE' });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.articles).toHaveLength(1);
            expect(data.articles[0].id).toBe(5);
        });
    });

    describe('countFiltered', () => {
        it('should count all non-draft articles', async () => {
            const result = await articleRepository.countFiltered();
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBe(4);
        });

        it('should count with status filter', async () => {
            const result = await articleRepository.countFiltered({ status: 'approved' });
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBe(2);
        });
    });

    describe('findByAuthorPaginated', () => {
        it('should return all statuses for author', async () => {
            const result = await articleRepository.findByAuthorPaginated(2, { first: 10 });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            // Author 2 has articles 1 (draft), 2 (pending), 3 (approved), 6 (draft)
            expect(data.articles).toHaveLength(4);
        });
    });

    describe('findPendingPaginated', () => {
        it('should return only pending articles', async () => {
            const result = await articleRepository.findPendingPaginated({ first: 10 });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.articles).toHaveLength(1);
            expect(data.articles[0].status).toBe('pending');
        });
    });

    describe('findApprovedPaginated', () => {
        it('should return only approved articles', async () => {
            const result = await articleRepository.findApprovedPaginated({ first: 10 });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.articles).toHaveLength(2);
            data.articles.forEach((a: any) => expect(a.status).toBe('approved'));
        });

        it('should filter by section', async () => {
            const result = await articleRepository.findApprovedPaginated(
                { first: 10 },
                { section: 'GROWTH_AND_GRIT' },
            );
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.articles).toHaveLength(1);
            expect(data.articles[0].section).toBe('GROWTH_AND_GRIT');
        });

        it('should filter by search (content)', async () => {
            const result = await articleRepository.findApprovedPaginated(
                { first: 10 },
                { search: 'Another approved' },
            );
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.articles).toHaveLength(1);
            expect(data.articles[0].title).toBe('Approved Article Two');
        });

        it('should filter by search (author name)', async () => {
            const result = await articleRepository.findApprovedPaginated(
                { first: 10 },
                { search: 'Author Two' },
            );
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.articles).toHaveLength(1);
            expect(data.articles[0].author_id).toBe(3);
        });
    });

    describe('incrementViews', () => {
        it('should create a new view entry', async () => {
            const result = await articleRepository.incrementViews(1);
            expect(result.isOk()).toBe(true);

            const view = await findViewById(1);
            expect(view).not.toBeNull();
            expect(Number(view.views)).toBe(1);
        });

        it('should increment existing view count', async () => {
            const result = await articleRepository.incrementViews(3);
            expect(result.isOk()).toBe(true);

            const view = await findViewById(3);
            expect(Number(view.views)).toBe(101);
        });
    });

    describe('findTrendingPaginated', () => {
        it('should return articles ordered by views', async () => {
            const result = await articleRepository.findTrendingPaginated({ first: 10 });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.articles).toHaveLength(2); // articles 3 and 4 have views
            // Article 4 has 250 views, article 3 has 100
            expect(data.articles[0].id).toBe(4);
            expect(data.articles[1].id).toBe(3);
        });
    });

    describe('searchApproved', () => {
        it('should search by title', async () => {
            const result = await articleRepository.searchApproved({ first: 10 }, 'Approved Article One');
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.articles).toHaveLength(1);
            expect(data.articles[0].title).toBe('Approved Article One');
            expect(data.articles[0].author_id).toBe(2);
        });

        it('should search by content', async () => {
            const result = await articleRepository.searchApproved({ first: 10 }, 'Another approved');
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.articles).toHaveLength(1);
            expect(data.articles[0].id).toBe(4);
        });

        it('should search by author name', async () => {
            const result = await articleRepository.searchApproved({ first: 10 }, 'Author Two');
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            // Author Two has 1 approved article (id=4)
            expect(data.articles).toHaveLength(1);
            expect(data.articles[0].author_id).toBe(3);
        });

        it('should search by section name', async () => {
            const result = await articleRepository.searchApproved({ first: 10 }, 'NATURE_AND_NURTURE');
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.articles).toHaveLength(1);
            expect(data.articles[0].section).toBe('NATURE_AND_NURTURE');
        });

        it('should search by subsection in JSON', async () => {
            const result = await articleRepository.searchApproved({ first: 10 }, 'ENDEAVOURS');
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.articles).toHaveLength(1);
            expect(data.articles[0].id).toBe(3);
        });

        it('should return empty for non-matching search', async () => {
            const result = await articleRepository.searchApproved({ first: 10 }, 'zzz_no_match');
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.articles).toHaveLength(0);
        });
    });
});
