import { ResultSetHeader } from 'mysql2';
import { db } from '../database/db.ts';
import { User } from '../models/user.model.ts';
import { ERRORS } from '../utils/error.ts';

export async function findByEmail(email: string): Promise<User | null> {
    const [rows] = await db.query<User[]>(
        'SELECT * FROM users WHERE email = ?',
        [email]
    );
    return rows[0] || null;
}

export async function findById(id: number): Promise<User | null> {
    const [rows] = await db.query<User[]>(
        'SELECT id, name, email, bio, profession, profile_photo, role, is_active, created_at FROM users WHERE id = ?',
        [id]
    );
    return rows[0] || null;
}

export async function findByIds(ids: number[]): Promise<User[]> {
    if (ids.length === 0) return [];
    const [rows] = await db.query<User[]>(
        'SELECT id, name, email, bio, profession, profile_photo, role, is_active, created_at FROM users WHERE id IN (?)',
        [ids]
    );
    return rows;
}

export async function create(
    name: string,
    email: string,
    passwordHash: string,
    role: string = 'author'
): Promise<number> {
    const [result] = await db.query<ResultSetHeader>(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [name, email, passwordHash, role]
    );
    return result.insertId;
}

export async function updateProfile(
    id: number,
    fields: Partial<Pick<User, 'name' | 'bio' | 'profession' | 'profile_photo'>>
): Promise<void> {
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;

    const setClauses = entries.map(([key]) => `${key} = ?`).join(', ');
    const values = entries.map(([, v]) => v);

    await db.query(
        `UPDATE users SET ${setClauses} WHERE id = ?`,
        [...values, id]
    );
}

export async function updatePassword(id: number, passwordHash: string): Promise<void> {
    await db.query(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        [passwordHash, id]
    );
}

export async function updateStatus(id: number, isActive: boolean): Promise<void> {
    await db.query(
        'UPDATE users SET is_active = ? WHERE id = ?',
        [isActive, id]
    );
}
