import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { err, ok, Result } from 'neverthrow';
import { db } from '../database/db.ts';
import { Article, ArticleFilter, CreateArticleInput, UpdateArticleInput } from '../models/article.model.ts';
import { ERRORS, RequestError } from '../utils/error.ts';
import { decodeCursor, PaginationArgs } from '../types/pagination.ts';
import createLogger from '../utils/logger.ts';

const logger = createLogger('@article.repository');

class ArticleRepository {
    async create(input: CreateArticleInput): Promise<Result<Article, RequestError>> {
        try {
            const { authorId, title, excerpt, content, section, subsections, coverImage, status } = input;
            const [result] = await db.query<ResultSetHeader>(
                `INSERT INTO articles (author_id, title, excerpt, content, section, subsections, cover_image, status, published_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    authorId,
                    title,
                    excerpt || null,
                    content,
                    section,
                    JSON.stringify(subsections),
                    coverImage || null,
                    status,
                    status === 'approved' ? new Date() : null,
                ],
            );

            const findResult = await this.findById(result.insertId);
            if (findResult.isErr()) return err(findResult.error);
            if (!findResult.value) return err(ERRORS.ARTICLE_NOT_FOUND);
            return ok(findResult.value);
        } catch (error) {
            logger.error('Error creating article:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async findById(id: number): Promise<Result<Article | null, RequestError>> {
        try {
            const [rows] = await db.query<Article[]>(
                'SELECT * FROM articles WHERE id = ?',
                [id],
            );
            return ok(rows[0] || null);
        } catch (error) {
            logger.error('Error finding article by id:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async update(id: number, input: UpdateArticleInput): Promise<Result<void, RequestError>> {
        try {
            const entries: [string, unknown][] = [];

            if (input.title !== undefined) entries.push(['title', input.title]);
            if (input.excerpt !== undefined) entries.push(['excerpt', input.excerpt]);
            if (input.content !== undefined) entries.push(['content', input.content]);
            if (input.section !== undefined) entries.push(['section', input.section]);
            if (input.subsections !== undefined) entries.push(['subsections', JSON.stringify(input.subsections)]);
            if (input.coverImage !== undefined) entries.push(['cover_image', input.coverImage]);

            if (entries.length === 0) return ok(undefined);

            const setClauses = entries.map(([key]) => `${key} = ?`).join(', ');
            const values = entries.map(([, v]) => v);

            await db.query(
                `UPDATE articles SET ${setClauses} WHERE id = ?`,
                [...values, id],
            );
            return ok(undefined);
        } catch (error) {
            logger.error('Error updating article:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async updateStatus(
        id: number,
        status: string,
        rejectionReason?: string,
    ): Promise<Result<void, RequestError>> {
        try {
            const publishedAt = status === 'approved' ? new Date() : null;
            await db.query(
                'UPDATE articles SET status = ?, rejection_reason = ?, published_at = COALESCE(?, published_at) WHERE id = ?',
                [status, rejectionReason || null, publishedAt, id],
            );
            return ok(undefined);
        } catch (error) {
            logger.error('Error updating article status:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async delete(id: number): Promise<Result<void, RequestError>> {
        try {
            await db.query('DELETE FROM articles WHERE id = ?', [id]);
            return ok(undefined);
        } catch (error) {
            logger.error('Error deleting article:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async bulkUpdateStatus(
        ids: number[],
        status: string,
        publishedAt?: Date,
    ): Promise<Result<void, RequestError>> {
        try {
            if (ids.length === 0) return ok(undefined);
            await db.query(
                'UPDATE articles SET status = ?, published_at = COALESCE(?, published_at) WHERE id IN (?)',
                [status, publishedAt || null, ids],
            );
            return ok(undefined);
        } catch (error) {
            logger.error('Error bulk updating article status:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async bulkDelete(ids: number[]): Promise<Result<void, RequestError>> {
        try {
            if (ids.length === 0) return ok(undefined);
            await db.query('DELETE FROM articles WHERE id IN (?)', [ids]);
            return ok(undefined);
        } catch (error) {
            logger.error('Error bulk deleting articles:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    private buildFilterClauses(filter?: ArticleFilter): { clauses: string[]; params: unknown[]; needsUserJoin: boolean } {
        const clauses: string[] = [];
        const params: unknown[] = [];
        let needsUserJoin = false;

        if (filter?.status) {
            clauses.push('a.status = ?');
            params.push(filter.status);
        }
        if (filter?.section) {
            clauses.push('a.section = ?');
            params.push(filter.section);
        }
        if (filter?.authorId) {
            clauses.push('a.author_id = ?');
            params.push(filter.authorId);
        }
        if (filter?.search) {
            clauses.push('(a.title LIKE ? OR a.content LIKE ? OR a.section LIKE ? OR a.subsections LIKE ? OR u.name LIKE ?)');
            const term = `%${filter.search}%`;
            params.push(term, term, term, term, term);
            needsUserJoin = true;
        }

        return { clauses, params, needsUserJoin };
    }

    async findPaginated(
        pagination: PaginationArgs,
        filter?: ArticleFilter,
    ): Promise<Result<{ articles: Article[]; hasMore: boolean }, RequestError>> {
        try {
            const { clauses, params, needsUserJoin } = this.buildFilterClauses(filter);
            const limit = pagination.first || 10;

            // Exclude drafts for admin listing (unless filtered by specific status)
            if (!filter?.status) {
                clauses.push("a.status != 'draft'");
            }

            if (pagination.after) {
                const cursorId = decodeCursor(pagination.after);
                clauses.push('a.id > ?');
                params.push(cursorId);
            }

            const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
            const join = needsUserJoin ? 'JOIN users u ON a.author_id = u.id' : '';
            const sql = `SELECT a.* FROM articles a ${join} ${where} ORDER BY a.id ASC LIMIT ?`;
            params.push(limit + 1);

            const [rows] = await db.query<Article[]>(sql, params);

            const hasMore = rows.length > limit;
            const articles = hasMore ? rows.slice(0, limit) : rows;

            return ok({ articles, hasMore });
        } catch (error) {
            logger.error('Error finding paginated articles:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async countFiltered(filter?: ArticleFilter): Promise<Result<number, RequestError>> {
        try {
            const { clauses, params, needsUserJoin } = this.buildFilterClauses(filter);

            if (!filter?.status) {
                clauses.push("a.status != 'draft'");
            }

            const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
            const join = needsUserJoin ? 'JOIN users u ON a.author_id = u.id' : '';
            const sql = `SELECT COUNT(*) as count FROM articles a ${join} ${where}`;

            const [rows] = await db.query<(RowDataPacket & { count: number })[]>(sql, params);
            return ok(rows[0].count);
        } catch (error) {
            logger.error('Error counting articles:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async findByAuthorPaginated(
        authorId: number,
        pagination: PaginationArgs,
        status?: string,
    ): Promise<Result<{ articles: Article[]; hasMore: boolean }, RequestError>> {
        try {
            const limit = pagination.first || 10;
            const clauses: string[] = ['a.author_id = ?'];
            const params: unknown[] = [authorId];

            if (status) {
                clauses.push('a.status = ?');
                params.push(status);
            }

            if (pagination.after) {
                const cursorId = decodeCursor(pagination.after);
                clauses.push('a.id > ?');
                params.push(cursorId);
            }

            const where = `WHERE ${clauses.join(' AND ')}`;
            const sql = `SELECT a.* FROM articles a ${where} ORDER BY a.id ASC LIMIT ?`;
            params.push(limit + 1);

            const [rows] = await db.query<Article[]>(sql, params);

            const hasMore = rows.length > limit;
            const articles = hasMore ? rows.slice(0, limit) : rows;

            return ok({ articles, hasMore });
        } catch (error) {
            logger.error('Error finding author articles:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async countByAuthor(authorId: number, status?: string): Promise<Result<number, RequestError>> {
        try {
            const clauses = ['author_id = ?'];
            const params: unknown[] = [authorId];

            if (status) {
                clauses.push('status = ?');
                params.push(status);
            }

            const where = `WHERE ${clauses.join(' AND ')}`;
            const [rows] = await db.query<(RowDataPacket & { count: number })[]>(
                `SELECT COUNT(*) as count FROM articles ${where}`,
                params,
            );
            return ok(rows[0].count);
        } catch (error) {
            logger.error('Error counting author articles:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async findPendingPaginated(
        pagination: PaginationArgs,
    ): Promise<Result<{ articles: Article[]; hasMore: boolean }, RequestError>> {
        try {
            const limit = pagination.first || 10;
            const clauses: string[] = ["a.status = 'pending'"];
            const params: unknown[] = [];

            if (pagination.after) {
                const cursorId = decodeCursor(pagination.after);
                clauses.push('a.id > ?');
                params.push(cursorId);
            }

            const where = `WHERE ${clauses.join(' AND ')}`;
            const sql = `SELECT a.* FROM articles a ${where} ORDER BY a.id ASC LIMIT ?`;
            params.push(limit + 1);

            const [rows] = await db.query<Article[]>(sql, params);

            const hasMore = rows.length > limit;
            const articles = hasMore ? rows.slice(0, limit) : rows;

            return ok({ articles, hasMore });
        } catch (error) {
            logger.error('Error finding pending articles:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async countPending(): Promise<Result<number, RequestError>> {
        try {
            const [rows] = await db.query<(RowDataPacket & { count: number })[]>(
                "SELECT COUNT(*) as count FROM articles WHERE status = 'pending'",
            );
            return ok(rows[0].count);
        } catch (error) {
            logger.error('Error counting pending articles:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async findApprovedPaginated(
        pagination: PaginationArgs,
        filter?: ArticleFilter,
    ): Promise<Result<{ articles: Article[]; hasMore: boolean }, RequestError>> {
        try {
            const limit = pagination.first || 10;
            const clauses: string[] = ["a.status = 'approved'"];
            const params: unknown[] = [];
            let needsUserJoin = false;

            if (filter?.section) {
                clauses.push('a.section = ?');
                params.push(filter.section);
            }
            if (filter?.search) {
                clauses.push('(a.title LIKE ? OR a.content LIKE ? OR a.section LIKE ? OR a.subsections LIKE ? OR u.name LIKE ?)');
                const term = `%${filter.search}%`;
                params.push(term, term, term, term, term);
                needsUserJoin = true;
            }

            if (pagination.after) {
                const cursorId = decodeCursor(pagination.after);
                clauses.push('a.id > ?');
                params.push(cursorId);
            }

            const where = `WHERE ${clauses.join(' AND ')}`;
            const join = needsUserJoin ? 'JOIN users u ON a.author_id = u.id' : '';
            const sql = `SELECT a.* FROM articles a ${join} ${where} ORDER BY a.id ASC LIMIT ?`;
            params.push(limit + 1);

            const [rows] = await db.query<Article[]>(sql, params);

            const hasMore = rows.length > limit;
            const articles = hasMore ? rows.slice(0, limit) : rows;

            return ok({ articles, hasMore });
        } catch (error) {
            logger.error('Error finding approved articles:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async countApproved(filter?: ArticleFilter): Promise<Result<number, RequestError>> {
        try {
            const clauses: string[] = ["a.status = 'approved'"];
            const params: unknown[] = [];
            let needsUserJoin = false;

            if (filter?.section) {
                clauses.push('a.section = ?');
                params.push(filter.section);
            }
            if (filter?.search) {
                clauses.push('(a.title LIKE ? OR a.content LIKE ? OR a.section LIKE ? OR a.subsections LIKE ? OR u.name LIKE ?)');
                const term = `%${filter.search}%`;
                params.push(term, term, term, term, term);
                needsUserJoin = true;
            }

            const where = `WHERE ${clauses.join(' AND ')}`;
            const join = needsUserJoin ? 'JOIN users u ON a.author_id = u.id' : '';
            const sql = `SELECT COUNT(*) as count FROM articles a ${join} ${where}`;

            const [rows] = await db.query<(RowDataPacket & { count: number })[]>(sql, params);
            return ok(rows[0].count);
        } catch (error) {
            logger.error('Error counting approved articles:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async incrementViews(articleId: number): Promise<Result<void, RequestError>> {
        try {
            await db.query(
                `INSERT INTO article_views (article_id, views) VALUES (?, 1)
                 ON DUPLICATE KEY UPDATE views = views + 1`,
                [articleId],
            );
            return ok(undefined);
        } catch (error) {
            logger.error('Error incrementing views:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async findTrendingPaginated(
        pagination: PaginationArgs,
    ): Promise<Result<{ articles: Article[]; hasMore: boolean }, RequestError>> {
        try {
            const limit = pagination.first || 10;
            const clauses: string[] = ["a.status = 'approved'"];
            const params: unknown[] = [];

            if (pagination.after) {
                const cursorId = decodeCursor(pagination.after);
                clauses.push('a.id > ?');
                params.push(cursorId);
            }

            const where = `WHERE ${clauses.join(' AND ')}`;
            const sql = `
                SELECT a.*
                FROM articles a
                JOIN article_views av ON a.id = av.article_id
                ${where}
                ORDER BY av.views DESC, a.id ASC
                LIMIT ?`;
            params.push(limit + 1);

            const [rows] = await db.query<Article[]>(sql, params);

            const hasMore = rows.length > limit;
            const articles = hasMore ? rows.slice(0, limit) : rows;

            return ok({ articles, hasMore });
        } catch (error) {
            logger.error('Error finding trending articles:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }

    async searchApproved(
        pagination: PaginationArgs,
        search: string,
    ): Promise<Result<{ articles: Article[]; hasMore: boolean }, RequestError>> {
        try {
            const limit = pagination.first || 10;
            const term = `%${search}%`;
            const clauses: string[] = [
                "a.status = 'approved'",
                '(a.title LIKE ? OR a.content LIKE ? OR a.section LIKE ? OR a.subsections LIKE ? OR u.name LIKE ?)',
            ];
            const params: unknown[] = [term, term, term, term, term];

            if (pagination.after) {
                const cursorId = decodeCursor(pagination.after);
                clauses.push('a.id > ?');
                params.push(cursorId);
            }

            const where = `WHERE ${clauses.join(' AND ')}`;
            const sql = `SELECT a.* FROM articles a
                         JOIN users u ON a.author_id = u.id
                         ${where} ORDER BY a.id ASC LIMIT ?`;
            params.push(limit + 1);

            const [rows] = await db.query<Article[]>(sql, params);

            const hasMore = rows.length > limit;
            const articles = hasMore ? rows.slice(0, limit) : rows;

            return ok({ articles, hasMore });
        } catch (error) {
            logger.error('Error searching approved articles:', error);
            return err(ERRORS.DATABASE_ERROR);
        }
    }
}

export const articleRepository = new ArticleRepository();
