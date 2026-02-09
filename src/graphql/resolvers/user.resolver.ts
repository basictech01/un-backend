import { ERRORS, toGraphQLError } from '../../utils/error.ts';
import { requireAuth, requireAdmin, GraphQLContext } from '../context.ts';
import { userRepository } from '../../repositories/user.repository.ts';
import { buildConnection, PaginationArgs } from '../../types/pagination.ts';
import { User, UserFilter, UpdateProfileInput } from '../../models/user.model.ts';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 10;

function validatePaginationArgs(args: PaginationArgs): PaginationArgs {
    const { first, after } = args;

    if (first != null && (first < 1 || first > MAX_PAGE_SIZE)) {
        throw toGraphQLError(ERRORS.PAGINATION_LIMIT_EXCEEDED);
    }

    return { first: first ?? DEFAULT_PAGE_SIZE, after };
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
    const connection = buildConnection<User>(users, hasMore);

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
            const { first, after, filter } = args;
            return resolveUserConnection({ first, after }, filter);
        },

        authors: async (_: unknown, args: UsersPaginationInput) => {
            const { first, after, filter } = args;
            const mergedFilter: UserFilter = { ...filter, role: 'author' };
            return resolveUserConnection({ first, after }, mergedFilter);
        },

        admins: async (_: unknown, args: UsersPaginationInput, context: GraphQLContext) => {
            requireAdmin(context);
            const { first, after, filter } = args;
            const mergedFilter: UserFilter = { ...filter, role: 'admin' };
            return resolveUserConnection({ first, after }, mergedFilter);
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
                throw toGraphQLError(ERRORS.USER_UPDATE_FAILED);
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
                throw toGraphQLError(ERRORS.USER_UPDATE_FAILED);
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
            const adminData = requireAdmin(context);

            // Prevent admin from deactivating themselves
            if (adminData.userId === id) {
                throw toGraphQLError(ERRORS.USER_SELF_DEACTIVATE);
            }

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
                throw toGraphQLError(ERRORS.USER_STATUS_TOGGLE_FAILED);
            }

            const updatedResult = await userRepository.findById(id);
            if (updatedResult.isErr()) {
                throw toGraphQLError(updatedResult.error);
            }

            return updatedResult.value;
        },
    },
};
