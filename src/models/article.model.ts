import { RowDataPacket } from 'mysql2';

export interface Article extends RowDataPacket {
    id: number;
    author_id: number;
    title: string;
    excerpt: string | null;
    content: string;
    section: string;
    subsections: string; // JSON string in DB
    cover_image: string | null;
    status: ArticleStatus;
    rejection_reason: string | null;
    published_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export type ArticleStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface CreateArticleInput {
    authorId: number;
    title: string;
    excerpt?: string;
    content: string;
    section: string;
    subsections: string[];
    coverImage?: string;
    status: ArticleStatus;
}

export interface UpdateArticleInput {
    title?: string;
    excerpt?: string;
    content?: string;
    section?: string;
    subsections?: string[];
    coverImage?: string;
}

export interface ArticleFilter {
    status?: string;
    section?: string;
    authorId?: number;
    search?: string;
}
