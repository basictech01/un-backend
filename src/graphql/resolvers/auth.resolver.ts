import { DateTimeResolver } from 'graphql-scalars';
import GraphQLJSON from 'graphql-type-json';
import bcrypt from 'bcrypt';
import { createAuthToken, createRefreshToken, decodeRefreshToken } from '../../utils/jwt.ts';
import { ERRORS, toGraphQLError } from '../../utils/error.ts';
import { requireAuth, GraphQLContext } from '../context.ts';
import { userRepository } from '../../repositories/user.repository.ts';
import { toUserView, SignupInput, LoginInput } from '../../models/user.model.ts';

export const authResolvers = {
    DateTime: DateTimeResolver,
    JSON: GraphQLJSON,

    Query: {
        me: async (_: unknown, __: unknown, context: GraphQLContext) => {
            const tokenData = requireAuth(context);
            const result = await userRepository.findById(tokenData.userId);

            if (result.isErr()) {
                throw toGraphQLError(result.error);
            }

            if (!result.value) {
                throw toGraphQLError(ERRORS.USER_NOT_FOUND);
            }

            return result.value;
        },
    },

    Mutation: {
        signup: async (_: unknown, { input }: { input: SignupInput }) => {
            const { name, email, password, role } = input;

            if (!name || !email || !password) {
                throw toGraphQLError(ERRORS.INVALID_REQUEST_BODY);
            }

            const existingResult = await userRepository.findByEmail(email);
            if (existingResult.isErr()) {
                throw toGraphQLError(existingResult.error);
            }
            if (existingResult.value) {
                throw toGraphQLError(ERRORS.DUPLICATE_EMAIL);
            }

            const passwordHash = await bcrypt.hash(password, 12);
            const createResult = await userRepository.create({ name, email, passwordHash, role: role || 'author' });

            if (createResult.isErr()) {
                throw toGraphQLError(createResult.error);
            }

            const userResult = await userRepository.findById(createResult.value);
            if (userResult.isErr() || !userResult.value) {
                throw toGraphQLError(ERRORS.USER_CREATION_FAILED);
            }

            const user = userResult.value;
            const tokenData = { userId: user.id, email: user.email, is_admin: user.role === 'admin' };
            const token = createAuthToken(tokenData);
            const refreshToken = createRefreshToken(tokenData);

            return { token, refreshToken, user };
        },

        login: async (_: unknown, { input }: { input: LoginInput }) => {
            const { email, password } = input;

            if (!email || !password) {
                throw toGraphQLError(ERRORS.INVALID_REQUEST_BODY);
            }

            const result = await userRepository.findByEmail(email);
            if (result.isErr()) {
                throw toGraphQLError(result.error);
            }
            if (!result.value) {
                throw toGraphQLError(ERRORS.INVALID_CREDENTIALS);
            }

            const user = result.value;

            if (!user.is_active) {
                throw toGraphQLError(ERRORS.USER_ACCOUNT_DEACTIVATED);
            }

            const valid = await bcrypt.compare(password, user.password_hash);
            if (!valid) {
                throw toGraphQLError(ERRORS.INVALID_CREDENTIALS);
            }

            const tokenData = { userId: user.id, email: user.email, is_admin: user.role === 'admin' };
            const token = createAuthToken(tokenData);
            const refreshToken = createRefreshToken(tokenData);

            const userView = toUserView(user);
            return { token, refreshToken, user: userView };
        },

        refreshToken: async (_: unknown, { token }: { token: string }) => {
            const decoded = decodeRefreshToken(token);
            const newToken = createAuthToken(decoded);
            return { token: newToken };
        },
    },
};
