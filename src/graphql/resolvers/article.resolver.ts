import { ERRORS, toGraphQLError } from '../../utils/error.ts';
import { requireAuth, requireAdmin, GraphQLContext } from '../context.ts';
import { articleRepository } from '../../repositories/article.repository.ts';
import { buildConnection, PaginationArgs } from '../../types/pagination.ts';
import { Article, ArticleFilter, CreateArticleInput, UpdateArticleInput } from '../../models/article.model.ts';
import { validateSection, validateSubsections } from '../../types/article.constants.ts';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 10;

function validatePaginationArgs(args: PaginationArgs): PaginationArgs {
    const { first, after } = args;

    if (first != null && (first < 1 || first > MAX_PAGE_SIZE)) {
        throw toGraphQLError(ERRORS.PAGINATION_LIMIT_EXCEEDED);
    }

    return { first: first ?? DEFAULT_PAGE_SIZE, after };
}

function mapStatusEnum(status: string | undefined | null): string | undefined {
    if (!status) return undefined;
    return status.toLowerCase();
}

function mapFilterInput(filter?: ArticleFilter | null): ArticleFilter | undefined {
    if (!filter) return undefined;
    return {
        status: mapStatusEnum(filter.status),
        section: filter.section || undefined,
        authorId: filter.authorId || undefined,
        search: filter.search || undefined,
    };
}

interface ArticlesPaginationInput extends PaginationArgs {
    filter?: ArticleFilter;
}

export const articleResolvers = {
    Article: {
        author: async (parent: Article, _: unknown, context: GraphQLContext) => {
            return context.loaders.userLoader.load(parent.author_id);
        },
    },

    Query: {
        article: async (_: unknown, { id }: { id: number }) => {
            const result = await articleRepository.findById(id);
            if (result.isErr()) throw toGraphQLError(result.error);
            if (!result.value) throw toGraphQLError(ERRORS.ARTICLE_NOT_FOUND);

            // Only return approved articles publicly
            if (result.value.status !== 'approved') {
                throw toGraphQLError(ERRORS.ARTICLE_NOT_FOUND);
            }

            // Increment views (fire-and-forget)
            articleRepository.incrementViews(id);

            return result.value;
        },

        articles: async (_: unknown, args: ArticlesPaginationInput, context: GraphQLContext) => {
            requireAdmin(context);
            const { first, after, filter } = args;
            const pagination = validatePaginationArgs({ first, after });
            const mappedFilter = mapFilterInput(filter);

            const result = await articleRepository.findPaginated(pagination, mappedFilter);
            if (result.isErr()) throw toGraphQLError(result.error);

            const { articles, hasMore } = result.value;
            const connection = buildConnection<Article>(articles, hasMore);

            const countResult = await articleRepository.countFiltered(mappedFilter);
            if (countResult.isErr()) throw toGraphQLError(countResult.error);

            return { ...connection, totalCount: countResult.value };
        },

        approvedArticles: async (_: unknown, args: ArticlesPaginationInput) => {
            const { first, after, filter } = args;
            const pagination = validatePaginationArgs({ first, after });
            const mappedFilter = mapFilterInput(filter);

            const result = await articleRepository.findApprovedPaginated(pagination, mappedFilter);
            if (result.isErr()) throw toGraphQLError(result.error);

            const { articles, hasMore } = result.value;
            const connection = buildConnection<Article>(articles, hasMore);

            const countResult = await articleRepository.countApproved(mappedFilter);
            if (countResult.isErr()) throw toGraphQLError(countResult.error);

            return { ...connection, totalCount: countResult.value };
        },

        myArticles: async (_: unknown, args: PaginationArgs, context: GraphQLContext) => {
            const tokenData = requireAuth(context);
            const pagination = validatePaginationArgs(args);

            const result = await articleRepository.findByAuthorPaginated(tokenData.userId, pagination);
            if (result.isErr()) throw toGraphQLError(result.error);

            const { articles, hasMore } = result.value;
            const connection = buildConnection<Article>(articles, hasMore);

            const countResult = await articleRepository.countByAuthor(tokenData.userId);
            if (countResult.isErr()) throw toGraphQLError(countResult.error);

            return { ...connection, totalCount: countResult.value };
        },

        pendingArticles: async (_: unknown, args: PaginationArgs, context: GraphQLContext) => {
            requireAdmin(context);
            const pagination = validatePaginationArgs(args);

            const result = await articleRepository.findPendingPaginated(pagination);
            if (result.isErr()) throw toGraphQLError(result.error);

            const { articles, hasMore } = result.value;
            const connection = buildConnection<Article>(articles, hasMore);

            const countResult = await articleRepository.countPending();
            if (countResult.isErr()) throw toGraphQLError(countResult.error);

            return { ...connection, totalCount: countResult.value };
        },

        trendingArticles: async (_: unknown, args: PaginationArgs) => {
            const pagination = validatePaginationArgs(args);

            const result = await articleRepository.findTrendingPaginated(pagination);
            if (result.isErr()) throw toGraphQLError(result.error);

            const { articles, hasMore } = result.value;
            const connection = buildConnection<Article>(articles, hasMore);

            const countResult = await articleRepository.countApproved();
            if (countResult.isErr()) throw toGraphQLError(countResult.error);

            return { ...connection, totalCount: countResult.value };
        },
    },

    Mutation: {
        createArticle: async (
            _: unknown,
            { input }: { input: CreateArticleInput & { status?: string } },
            context: GraphQLContext,
        ) => {
            const tokenData = requireAuth(context);

            // Validate required fields
            if (!input.title?.trim()) throw toGraphQLError(ERRORS.ARTICLE_TITLE_REQUIRED);
            if (!input.content?.trim()) throw toGraphQLError(ERRORS.ARTICLE_CONTENT_REQUIRED);
            if (!input.section?.trim()) throw toGraphQLError(ERRORS.ARTICLE_SECTION_REQUIRED);
            if (!input.subsections || input.subsections.length === 0) {
                throw toGraphQLError(ERRORS.ARTICLE_SUBSECTIONS_REQUIRED);
            }

            // Validate section
            const sectionResult = validateSection(input.section);
            if (sectionResult.isErr()) throw toGraphQLError(sectionResult.error);

            // Validate subsections belong to section
            const subsResult = validateSubsections(input.subsections, input.section);
            if (subsResult.isErr()) throw toGraphQLError(subsResult.error);

            // Determine status: admin → approved, author → draft
            const isAdmin = tokenData.is_admin === true;
            const status = isAdmin ? 'approved' : 'draft';

            const result = await articleRepository.create({
                authorId: tokenData.userId,
                title: input.title,
                excerpt: input.excerpt,
                content: input.content,
                section: input.section,
                subsections: input.subsections,
                coverImage: input.coverImage,
                status,
            });

            if (result.isErr()) throw toGraphQLError(ERRORS.ARTICLE_CREATE_FAILED);
            return result.value;
        },

        updateArticle: async (
            _: unknown,
            { id, input }: { id: number; input: UpdateArticleInput },
            context: GraphQLContext,
        ) => {
            const tokenData = requireAuth(context);
            const isAdmin = tokenData.is_admin === true;

            // Find article
            const findResult = await articleRepository.findById(id);
            if (findResult.isErr()) throw toGraphQLError(findResult.error);
            if (!findResult.value) throw toGraphQLError(ERRORS.ARTICLE_NOT_FOUND);

            const article = findResult.value;

            // Author can only update own articles in draft/rejected status
            if (!isAdmin) {
                if (article.author_id !== tokenData.userId) {
                    throw toGraphQLError(ERRORS.ARTICLE_NOT_OWNED);
                }
                if (article.status !== 'draft' && article.status !== 'rejected') {
                    throw toGraphQLError(ERRORS.ARTICLE_EDIT_NOT_ALLOWED);
                }
            }

            // Validate section/subsections if provided
            const section = input.section || article.section;
            if (input.section) {
                const sectionResult = validateSection(input.section);
                if (sectionResult.isErr()) throw toGraphQLError(sectionResult.error);
            }
            if (input.subsections) {
                if (input.subsections.length === 0) {
                    throw toGraphQLError(ERRORS.ARTICLE_SUBSECTIONS_REQUIRED);
                }
                const subsResult = validateSubsections(input.subsections, section);
                if (subsResult.isErr()) throw toGraphQLError(subsResult.error);
            }

            const updateResult = await articleRepository.update(id, input);
            if (updateResult.isErr()) throw toGraphQLError(ERRORS.ARTICLE_UPDATE_FAILED);

            const updatedResult = await articleRepository.findById(id);
            if (updatedResult.isErr()) throw toGraphQLError(updatedResult.error);
            if (!updatedResult.value) throw toGraphQLError(ERRORS.ARTICLE_NOT_FOUND);

            return updatedResult.value;
        },

        submitArticle: async (_: unknown, { id }: { id: number }, context: GraphQLContext) => {
            const tokenData = requireAuth(context);

            const findResult = await articleRepository.findById(id);
            if (findResult.isErr()) throw toGraphQLError(findResult.error);
            if (!findResult.value) throw toGraphQLError(ERRORS.ARTICLE_NOT_FOUND);

            const article = findResult.value;

            if (article.author_id !== tokenData.userId) {
                throw toGraphQLError(ERRORS.ARTICLE_NOT_OWNED);
            }
            if (article.status === 'pending') {
                throw toGraphQLError(ERRORS.ARTICLE_ALREADY_PENDING);
            }
            if (article.status === 'approved') {
                throw toGraphQLError(ERRORS.ARTICLE_ALREADY_APPROVED);
            }
            if (article.status !== 'draft') {
                throw toGraphQLError(ERRORS.ARTICLE_NOT_DRAFT);
            }

            const updateResult = await articleRepository.updateStatus(id, 'pending');
            if (updateResult.isErr()) throw toGraphQLError(ERRORS.ARTICLE_STATUS_UPDATE_FAILED);

            const updatedResult = await articleRepository.findById(id);
            if (updatedResult.isErr()) throw toGraphQLError(updatedResult.error);
            if (!updatedResult.value) throw toGraphQLError(ERRORS.ARTICLE_NOT_FOUND);

            return updatedResult.value;
        },

        approveArticle: async (_: unknown, { id }: { id: number }, context: GraphQLContext) => {
            requireAdmin(context);

            const findResult = await articleRepository.findById(id);
            if (findResult.isErr()) throw toGraphQLError(findResult.error);
            if (!findResult.value) throw toGraphQLError(ERRORS.ARTICLE_NOT_FOUND);

            if (findResult.value.status === 'approved') {
                throw toGraphQLError(ERRORS.ARTICLE_ALREADY_APPROVED);
            }
            if (findResult.value.status !== 'pending') {
                throw toGraphQLError(ERRORS.ARTICLE_NOT_PENDING);
            }

            const updateResult = await articleRepository.updateStatus(id, 'approved');
            if (updateResult.isErr()) throw toGraphQLError(ERRORS.ARTICLE_STATUS_UPDATE_FAILED);

            const updatedResult = await articleRepository.findById(id);
            if (updatedResult.isErr()) throw toGraphQLError(updatedResult.error);
            if (!updatedResult.value) throw toGraphQLError(ERRORS.ARTICLE_NOT_FOUND);

            return updatedResult.value;
        },

        rejectArticle: async (
            _: unknown,
            { id, reason }: { id: number; reason: string },
            context: GraphQLContext,
        ) => {
            requireAdmin(context);

            if (!reason?.trim()) {
                throw toGraphQLError(ERRORS.REJECTION_REASON_REQUIRED);
            }

            const findResult = await articleRepository.findById(id);
            if (findResult.isErr()) throw toGraphQLError(findResult.error);
            if (!findResult.value) throw toGraphQLError(ERRORS.ARTICLE_NOT_FOUND);

            if (findResult.value.status === 'rejected') {
                throw toGraphQLError(ERRORS.ARTICLE_ALREADY_REJECTED);
            }
            if (findResult.value.status !== 'pending') {
                throw toGraphQLError(ERRORS.ARTICLE_NOT_PENDING);
            }

            const updateResult = await articleRepository.updateStatus(id, 'rejected', reason.trim());
            if (updateResult.isErr()) throw toGraphQLError(ERRORS.ARTICLE_STATUS_UPDATE_FAILED);

            const updatedResult = await articleRepository.findById(id);
            if (updatedResult.isErr()) throw toGraphQLError(updatedResult.error);
            if (!updatedResult.value) throw toGraphQLError(ERRORS.ARTICLE_NOT_FOUND);

            return updatedResult.value;
        },

        resubmitArticle: async (_: unknown, { id }: { id: number }, context: GraphQLContext) => {
            const tokenData = requireAuth(context);

            const findResult = await articleRepository.findById(id);
            if (findResult.isErr()) throw toGraphQLError(findResult.error);
            if (!findResult.value) throw toGraphQLError(ERRORS.ARTICLE_NOT_FOUND);

            const article = findResult.value;

            if (article.author_id !== tokenData.userId) {
                throw toGraphQLError(ERRORS.ARTICLE_NOT_OWNED);
            }
            if (article.status === 'pending') {
                throw toGraphQLError(ERRORS.ARTICLE_ALREADY_PENDING);
            }
            if (article.status !== 'rejected') {
                throw toGraphQLError(ERRORS.ARTICLE_NOT_REJECTED);
            }

            // Transition to pending, clear rejection reason
            const updateResult = await articleRepository.updateStatus(id, 'pending');
            if (updateResult.isErr()) throw toGraphQLError(ERRORS.ARTICLE_STATUS_UPDATE_FAILED);

            const updatedResult = await articleRepository.findById(id);
            if (updatedResult.isErr()) throw toGraphQLError(updatedResult.error);
            if (!updatedResult.value) throw toGraphQLError(ERRORS.ARTICLE_NOT_FOUND);

            return updatedResult.value;
        },

        deleteArticle: async (_: unknown, { id }: { id: number }, context: GraphQLContext) => {
            const tokenData = requireAuth(context);
            const isAdmin = tokenData.is_admin === true;

            const findResult = await articleRepository.findById(id);
            if (findResult.isErr()) throw toGraphQLError(findResult.error);
            if (!findResult.value) throw toGraphQLError(ERRORS.ARTICLE_NOT_FOUND);

            const article = findResult.value;

            // Author can only delete own drafts
            if (!isAdmin) {
                if (article.author_id !== tokenData.userId) {
                    throw toGraphQLError(ERRORS.ARTICLE_NOT_OWNED);
                }
                if (article.status !== 'draft') {
                    throw toGraphQLError(ERRORS.ARTICLE_DELETE_NOT_DRAFT);
                }
            }

            const deleteResult = await articleRepository.delete(id);
            if (deleteResult.isErr()) throw toGraphQLError(ERRORS.ARTICLE_DELETE_FAILED);

            return article;
        },

        bulkApproveArticles: async (
            _: unknown,
            { ids }: { ids: number[] },
            context: GraphQLContext,
        ) => {
            requireAdmin(context);

            if (!ids || ids.length === 0) {
                throw toGraphQLError(ERRORS.ARTICLE_IDS_REQUIRED);
            }

            const result = await articleRepository.bulkUpdateStatus(ids, 'approved', new Date());
            if (result.isErr()) throw toGraphQLError(ERRORS.ARTICLE_BULK_APPROVE_FAILED);

            return true;
        },

        bulkDeleteArticles: async (
            _: unknown,
            { ids }: { ids: number[] },
            context: GraphQLContext,
        ) => {
            requireAdmin(context);

            if (!ids || ids.length === 0) {
                throw toGraphQLError(ERRORS.ARTICLE_IDS_REQUIRED);
            }

            const result = await articleRepository.bulkDelete(ids);
            if (result.isErr()) throw toGraphQLError(ERRORS.ARTICLE_BULK_DELETE_FAILED);

            return true;
        },

        incrementViews: async (_: unknown, { id }: { id: number }) => {
            const result = await articleRepository.incrementViews(id);
            if (result.isErr()) throw toGraphQLError(ERRORS.ARTICLE_VIEW_INCREMENT_FAILED);
            return true;
        },
    },
};
