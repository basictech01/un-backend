import { RowDataPacket } from 'mysql2';

export interface User extends RowDataPacket {
    id: number;
    name: string;
    email: string;
    password_hash: string;
    bio: string | null;
    profession: string | null;
    profile_photo: string | null;
    role: 'author' | 'admin';
    is_active: boolean;
    created_at: Date;
}

export type UserView = Omit<User, 'password_hash'>;

export function toUserView(user: User): UserView {
    const { password_hash, ...view } = user;
    return view as UserView;
}

export interface UserFilter {
    role?: string;
    isActive?: boolean;
    search?: string;
}

export interface CreateUserInput {
    name: string;
    email: string;
    passwordHash: string;
    role?: string;
}

export type UpdateProfileInput = Partial<Pick<User, 'name' | 'bio' | 'profession' | 'profile_photo'>>;

export interface SignupInput {
    name: string;
    email: string;
    password: string;
    role?: string;
}

export interface LoginInput {
    email: string;
    password: string;
}