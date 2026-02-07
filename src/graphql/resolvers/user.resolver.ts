import { ERRORS, toGraphQLError } from '../../utils/error.ts';
import { requireAuth, requireAdmin, GraphQLContext } from '../context.ts';
import { userRepository } from '../../repositories/user.repository.ts';
import { buildConnection, PaginationArgs } from '../../types/pagination.ts';
import { User, UserFilter, UpdateProfileInput } from '../../models/user.model.ts';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 10;

function validatePaginationArgs(args: PaginationArgs): PaginationArgs {
    const { first, after, last, before } = args;

    // Cannot use both forward and backward at the same time
    if (first != null && last != null) {
        throw toGraphQLError(ERRORS.INVALID_PAGINATION_ARGS);
    }

    // Validate limits
    if (first != null && (first < 1 || first > MAX_PAGE_SIZE)) {
        throw toGraphQLError(ERRORS.INVALID_PAGINATION_ARGS);
    }
    if (last != null && (last < 1 || last > MAX_PAGE_SIZE)) {
        throw toGraphQLError(ERRORS.INVALID_PAGINATION_ARGS);
    }

    // Default to forward pagination
    if (first == null && last == null) {
        return { first: DEFAULT_PAGE_SIZE, after, last, before };
    }

    return { first, after, last, before };
}

async function resolveUserConnection(
    pagination: PaginationArgs,
    filter?: UserFilter
) {
    const validatedArgs = validatePaginationArgs(pagination);

    const result = await userRepository.findPaginated(validatedArgs, filter);
    if (result.isErr()) {
        throw toGraphQLError(result.error);
    }

    const { users, hasMore } = result.value;
    const direction = validatedArgs.last ? 'backward' : 'forward';
    const connection = buildConnection<User>(users, hasMore, direction);

    const countResult = await userRepository.countFiltered(filter);
    if (countResult.isErr()) {
        throw toGraphQLError(countResult.error);
    }

    return { ...connection, totalCount: countResult.value };
}

interface UsersPaginationInput extends PaginationArgs {
    filter?: UserFilter;
}

export const userResolvers = {
    Query: {
        users: async (_: unknown, args: UsersPaginationInput, context: GraphQLContext) => {
            requireAdmin(context);
            const { first, after, last, before, filter } = args;
            return resolveUserConnection({ first, after, last, before }, filter);
        },

        authors: async (_: unknown, args: UsersPaginationInput) => {
            const { first, after, last, before, filter } = args;
            const mergedFilter: UserFilter = { ...filter, role: 'author' };
            return resolveUserConnection({ first, after, last, before }, mergedFilter);
        },

        admins: async (_: unknown, args: UsersPaginationInput, context: GraphQLContext) => {
            requireAdmin(context);
            const { first, after, last, before, filter } = args;
            const mergedFilter: UserFilter = { ...filter, role: 'admin' };
            return resolveUserConnection({ first, after, last, before }, mergedFilter);
        },
    },

    Mutation: {
        updateProfile: async (
            _: unknown,
            { input }: { input: UpdateProfileInput },
            context: GraphQLContext
        ) => {
            const tokenData = requireAuth(context);

            const updateResult = await userRepository.updateProfile(tokenData.userId, input);
            if (updateResult.isErr()) {
                throw toGraphQLError(updateResult.error);
            }

            const userResult = await userRepository.findById(tokenData.userId);
            if (userResult.isErr()) {
                throw toGraphQLError(userResult.error);
            }
            if (!userResult.value) {
                throw toGraphQLError(ERRORS.USER_NOT_FOUND);
            }

            return userResult.value;
        },

        adminUpdateUser: async (
            _: unknown,
            { id, input }: { id: number; input: UpdateProfileInput },
            context: GraphQLContext
        ) => {
            requireAdmin(context);

            // Verify target exists
            const targetResult = await userRepository.findById(id);
            if (targetResult.isErr()) {
                throw toGraphQLError(targetResult.error);
            }
            if (!targetResult.value) {
                throw toGraphQLError(ERRORS.USER_NOT_FOUND);
            }

            // Only allow editing authors, not other admins
            if (targetResult.value.role !== 'author') {
                throw toGraphQLError(ERRORS.USER_NOT_AUTHOR);
            }

            const updateResult = await userRepository.updateProfile(id, input);
            if (updateResult.isErr()) {
                throw toGraphQLError(updateResult.error);
            }

            const updatedResult = await userRepository.findById(id);
            if (updatedResult.isErr()) {
                throw toGraphQLError(updatedResult.error);
            }

            return updatedResult.value;
        },

        toggleUserStatus: async (
            _: unknown,
            { id, isActive }: { id: number; isActive: boolean },
            context: GraphQLContext
        ) => {
            requireAdmin(context);

            // Verify target exists
            const targetResult = await userRepository.findById(id);
            if (targetResult.isErr()) {
                throw toGraphQLError(targetResult.error);
            }
            if (!targetResult.value) {
                throw toGraphQLError(ERRORS.USER_NOT_FOUND);
            }

            // Only allow toggling authors, not other admins
            if (targetResult.value.role !== 'author') {
                throw toGraphQLError(ERRORS.USER_NOT_AUTHOR);
            }

            const updateResult = await userRepository.updateStatus(id, isActive);
            if (updateResult.isErr()) {
                throw toGraphQLError(updateResult.error);
            }

            const updatedResult = await userRepository.findById(id);
            if (updatedResult.isErr()) {
                throw toGraphQLError(updatedResult.error);
            }

            return updatedResult.value;
        },
    },
};
