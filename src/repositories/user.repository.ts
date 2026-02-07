import { ResultSetHeader } from 'mysql2';
import { err, ok, Result } from 'neverthrow';
import { db } from '../database/db.ts';
import { User } from '../models/user.model.ts';
import { ERRORS, RequestError } from '../utils/error.ts';
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

    async create(
        name: string,
        email: string,
        passwordHash: string,
        role: string = 'author'
    ): Promise<Result<number, RequestError>> {
        try {
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
        fields: Partial<Pick<User, 'name' | 'bio' | 'profession' | 'profile_photo'>>
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
            return err(ERRORS.USER_UPDATE_FAILED);
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
            return err(ERRORS.USER_UPDATE_FAILED);
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
            return err(ERRORS.USER_UPDATE_FAILED);
        }
    }
}

export const userRepository = new UserRepository();
