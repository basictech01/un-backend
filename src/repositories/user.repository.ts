import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { err, ok, Result } from 'neverthrow';
import { db } from '../database/db.ts';
import { User, UserFilter, CreateUserInput, UpdateProfileInput } from '../models/user.model.ts';
import { ERRORS, RequestError } from '../utils/error.ts';
import { decodeCursor, PaginationArgs } from '../types/pagination.ts';
import createLogger from '../utils/logger.ts';

const logger = createLogger('@user.repository');




class UserRepository {
    async findByEmail(email: string): Promise<Result<User | null, RequestError>> {
        try {
            const [rows] = await db.query<User[]>(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );
            return ok(rows[0] || null);
        } catch (error) {
            logger.error('Error finding user by email:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async findById(id: number): Promise<Result<User | null, RequestError>> {
        try {
            const [rows] = await db.query<User[]>(
                'SELECT id, name, email, bio, profession, profile_photo, role, is_active, created_at FROM users WHERE id = ?',
                [id]
            );
            return ok(rows[0] || null);
        } catch (error) {
            logger.error('Error finding user by id:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async findByIds(ids: number[]): Promise<Result<User[], RequestError>> {
        try {
            if (ids.length === 0) return ok([]);
            const [rows] = await db.query<User[]>(
                'SELECT id, name, email, bio, profession, profile_photo, role, is_active, created_at FROM users WHERE id IN (?)',
                [ids]
            );
            return ok(rows);
        } catch (error) {
            logger.error('Error finding users by ids:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async create(input: CreateUserInput): Promise<Result<number, RequestError>> {
        try {
            const { name, email, passwordHash, role = 'author' } = input;
            const [result] = await db.query<ResultSetHeader>(
                'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
                [name, email, passwordHash, role]
            );
            return ok(result.insertId);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            if (msg.includes('ER_DUP_ENTRY') || msg.includes('Duplicate entry')) {
                return err(ERRORS.DUPLICATE_EMAIL);
            }
            logger.error('Error creating user:', error);
            return err(ERRORS.USER_CREATION_FAILED);
        }
    }

    async updateProfile(
        id: number,
        fields: UpdateProfileInput
    ): Promise<Result<void, RequestError>> {
        try {
            const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
            if (entries.length === 0) return ok(undefined);

            const setClauses = entries.map(([key]) => `${key} = ?`).join(', ');
            const values = entries.map(([, v]) => v);

            await db.query(
                `UPDATE users SET ${setClauses} WHERE id = ?`,
                [...values, id]
            );
            return ok(undefined);
        } catch (error) {
            logger.error('Error updating user profile:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async updatePassword(id: number, passwordHash: string): Promise<Result<void, RequestError>> {
        try {
            await db.query(
                'UPDATE users SET password_hash = ? WHERE id = ?',
                [passwordHash, id]
            );
            return ok(undefined);
        } catch (error) {
            logger.error('Error updating password:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async updateStatus(id: number, isActive: boolean): Promise<Result<void, RequestError>> {
        try {
            await db.query(
                'UPDATE users SET is_active = ? WHERE id = ?',
                [isActive, id]
            );
            return ok(undefined);
        } catch (error) {
            logger.error('Error updating user status:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    private buildFilterClauses(filter?: UserFilter): { clauses: string[]; params: unknown[] } {
        const clauses: string[] = [];
        const params: unknown[] = [];

        if (filter?.role) {
            clauses.push('role = ?');
            params.push(filter.role);
        }
        if (filter?.isActive !== undefined) {
            clauses.push('is_active = ?');
            params.push(filter.isActive);
        }
        if (filter?.search) {
            clauses.push('(name LIKE ? OR email LIKE ?)');
            const term = `%${filter.search}%`;
            params.push(term, term);
        }

        return { clauses, params };
    }

    async findPaginated(
        pagination: PaginationArgs,
        filter?: UserFilter
    ): Promise<Result<{ users: User[]; hasMore: boolean }, RequestError>> {
        try {
            const { clauses, params } = this.buildFilterClauses(filter);
            const limit = pagination.first || 10;

            if (pagination.after) {
                const cursorId = decodeCursor(pagination.after);
                clauses.push('id > ?');
                params.push(cursorId);
            }

            const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
            const sql = `SELECT id, name, email, bio, profession, profile_photo, role, is_active, created_at FROM users ${where} ORDER BY id ASC LIMIT ?`;
            params.push(limit + 1);

            const [rows] = await db.query<User[]>(sql, params);

            const hasMore = rows.length > limit;
            const users = hasMore ? rows.slice(0, limit) : rows;

            return ok({ users, hasMore });
        } catch (error) {
            logger.error('Error finding paginated users:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async countFiltered(filter?: UserFilter): Promise<Result<number, RequestError>> {
        try {
            const { clauses, params } = this.buildFilterClauses(filter);
            const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
            const sql = `SELECT COUNT(*) as count FROM users ${where}`;

            const [rows] = await db.query<(RowDataPacket & { count: number })[]>(sql, params);
            return ok(rows[0].count);
        } catch (error) {
            logger.error('Error counting users:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }
}

export const userRepository = new UserRepository();
