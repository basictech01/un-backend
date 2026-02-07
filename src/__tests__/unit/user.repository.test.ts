import { jest } from '@jest/globals';
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

const { userRepository } = await import('../../repositories/user.repository.ts');

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
    await mockPool.query('DELETE FROM users');
    await mockPool.query('ALTER TABLE users AUTO_INCREMENT = 1');
    await mockPool.query(`
        INSERT INTO users (id, name, email, password_hash, bio, profession, profile_photo, role, is_active) VALUES
        (1, 'Alice Author', 'alice@test.com', 'hash1', 'Bio of Alice', 'Writer', NULL, 'author', TRUE),
        (2, 'Bob Author', 'bob@test.com', 'hash2', 'Bio of Bob', 'Journalist', NULL, 'author', TRUE),
        (3, 'Charlie Admin', 'charlie@test.com', 'hash3', 'Admin bio', 'Administrator', NULL, 'admin', TRUE),
        (4, 'Diana Author', 'diana@test.com', 'hash4', NULL, NULL, NULL, 'author', FALSE),
        (5, 'Eve Admin', 'eve@test.com', 'hash5', NULL, NULL, NULL, 'admin', TRUE)
    `);
}

async function findUserById(id: number) {
    const [rows] = await mockPool.query('SELECT * FROM users WHERE id = ?', [id]);
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

describe('UserRepository', () => {
    beforeEach(async () => {
        await resetUsersTable();
    });

    describe('findByEmail', () => {
        it('should return ok with user when found', async () => {
            const result = await userRepository.findByEmail('alice@test.com');
            expect(result.isOk()).toBe(true);
            const user = result._unsafeUnwrap();
            expect(user).not.toBeNull();
            expect(user!.email).toBe('alice@test.com');
            expect(user!.name).toBe('Alice Author');
        });

        it('should return ok with null when not found', async () => {
            const result = await userRepository.findByEmail('notfound@test.com');
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBeNull();
        });
    });

    describe('findById', () => {
        it('should return ok with user', async () => {
            const result = await userRepository.findById(1);
            expect(result.isOk()).toBe(true);
            const user = result._unsafeUnwrap();
            expect(user).not.toBeNull();
            expect(user!.name).toBe('Alice Author');
            expect(user!.email).toBe('alice@test.com');
        });

        it('should return ok with null when not found', async () => {
            const result = await userRepository.findById(999);
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBeNull();
        });
    });

    describe('findByIds', () => {
        it('should return ok with users matching IDs', async () => {
            const result = await userRepository.findByIds([1, 3]);
            expect(result.isOk()).toBe(true);
            const users = result._unsafeUnwrap();
            expect(users).toHaveLength(2);
            expect(users.map((u: any) => u.id).sort()).toEqual([1, 3]);
        });

        it('should return ok with empty array for empty input', async () => {
            const result = await userRepository.findByIds([]);
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toEqual([]);
        });
    });

    describe('create', () => {
        it('should create user and return insertId', async () => {
            const result = await userRepository.create({
                name: 'New User',
                email: 'new@test.com',
                passwordHash: 'newhash',
            });
            expect(result.isOk()).toBe(true);
            const insertId = result._unsafeUnwrap();
            expect(insertId).toBeGreaterThan(0);

            // Verify in DB
            const user = await findUserById(insertId);
            expect(user.name).toBe('New User');
            expect(user.email).toBe('new@test.com');
            expect(user.role).toBe('author');
        });

        it('should return err with DUPLICATE_EMAIL on duplicate entry', async () => {
            const result = await userRepository.create({
                name: 'Duplicate',
                email: 'alice@test.com',
                passwordHash: 'hash',
            });
            expect(result.isErr()).toBe(true);
            expect(result._unsafeUnwrapErr().message).toBe('Email already exists');
        });

        it('should accept custom role', async () => {
            const result = await userRepository.create({
                name: 'New Admin',
                email: 'newadmin@test.com',
                passwordHash: 'hash',
                role: 'admin',
            });
            expect(result.isOk()).toBe(true);

            const user = await findUserById(result._unsafeUnwrap());
            expect(user.role).toBe('admin');
        });
    });

    describe('updateProfile', () => {
        it('should update fields in DB', async () => {
            const result = await userRepository.updateProfile(1, { name: 'Updated Alice', bio: 'New bio' });
            expect(result.isOk()).toBe(true);

            const user = await findUserById(1);
            expect(user.name).toBe('Updated Alice');
            expect(user.bio).toBe('New bio');
        });

        it('should skip when no fields provided', async () => {
            const result = await userRepository.updateProfile(1, {});
            expect(result.isOk()).toBe(true);

            // User unchanged
            const user = await findUserById(1);
            expect(user.name).toBe('Alice Author');
        });
    });

    describe('updatePassword', () => {
        it('should update password hash in DB', async () => {
            const result = await userRepository.updatePassword(1, 'newhash123');
            expect(result.isOk()).toBe(true);

            const user = await findUserById(1);
            expect(user.password_hash).toBe('newhash123');
        });
    });

    describe('updateStatus', () => {
        it('should deactivate user', async () => {
            const result = await userRepository.updateStatus(1, false);
            expect(result.isOk()).toBe(true);

            const user = await findUserById(1);
            expect(user.is_active).toBe(0);
        });

        it('should activate user', async () => {
            const result = await userRepository.updateStatus(4, true);
            expect(result.isOk()).toBe(true);

            const user = await findUserById(4);
            expect(user.is_active).toBe(1);
        });
    });

    describe('findPaginated', () => {
        it('should return forward paginated users', async () => {
            const result = await userRepository.findPaginated({ first: 2 });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.users).toHaveLength(2);
            expect(data.hasMore).toBe(true);
            expect(data.users[0].id).toBe(1);
            expect(data.users[1].id).toBe(2);
        });

        it('should return all users when limit exceeds total', async () => {
            const result = await userRepository.findPaginated({ first: 100 });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.users).toHaveLength(5);
            expect(data.hasMore).toBe(false);
        });

        it('should apply after cursor for forward pagination', async () => {
            const cursor = Buffer.from('2').toString('base64');
            const result = await userRepository.findPaginated({ first: 10, after: cursor });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            // Should only return users with id > 2
            expect(data.users.every((u: any) => u.id > 2)).toBe(true);
            expect(data.users).toHaveLength(3);
        });

        it('should filter by role', async () => {
            const result = await userRepository.findPaginated({ first: 10 }, { role: 'author' });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.users.every((u: any) => u.role === 'author')).toBe(true);
            expect(data.users).toHaveLength(3); // Alice, Bob, Diana
        });

        it('should filter by isActive', async () => {
            const result = await userRepository.findPaginated({ first: 10 }, { isActive: true });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.users.every((u: any) => u.is_active === 1)).toBe(true);
            expect(data.users).toHaveLength(4); // Alice, Bob, Charlie, Eve
        });

        it('should filter by search term', async () => {
            const result = await userRepository.findPaginated({ first: 10 }, { search: 'alice' });
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            expect(data.users).toHaveLength(1);
            expect(data.users[0].name).toBe('Alice Author');
        });

        it('should combine multiple filters', async () => {
            const result = await userRepository.findPaginated(
                { first: 10 },
                { role: 'author', isActive: true }
            );
            expect(result.isOk()).toBe(true);
            const data = result._unsafeUnwrap();
            // Active authors: Alice, Bob (Diana is inactive)
            expect(data.users).toHaveLength(2);
            expect(data.users.every((u: any) => u.role === 'author' && u.is_active === 1)).toBe(true);
        });
    });

    describe('countFiltered', () => {
        it('should return total count of all users', async () => {
            const result = await userRepository.countFiltered();
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBe(5);
        });

        it('should count with role filter', async () => {
            const result = await userRepository.countFiltered({ role: 'author' });
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBe(3);
        });

        it('should count with combined filters', async () => {
            const result = await userRepository.countFiltered({ role: 'author', isActive: true });
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBe(2);
        });

        it('should count with search filter', async () => {
            const result = await userRepository.countFiltered({ search: 'admin' });
            expect(result.isOk()).toBe(true);
            // "Charlie Admin" and "Eve Admin" match "admin" in name
            expect(result._unsafeUnwrap()).toBe(2);
        });
    });
});
