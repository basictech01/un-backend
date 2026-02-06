import { GraphQLError } from 'graphql';
import { DateTimeResolver } from 'graphql-scalars';
import GraphQLJSON from 'graphql-type-json';
import bcrypt from 'bcrypt';
import { createAuthToken, createRefreshToken, decodeRefreshToken } from '../../utils/jwt.ts';
import { requireAuth, GraphQLContext } from '../context.ts';
import { ERRORS, RequestError } from '../../utils/error.ts';
import * as UserRepo from '../../repositories/user.repository.ts';
import { toUserView } from '../../models/user.model.ts';
import createLogger from '../../utils/logger.ts';

const logger = createLogger('@auth.resolver');

function toGraphQLError(error: unknown): GraphQLError {
    if (error instanceof RequestError) {
        return new GraphQLError(error.message, {
            extensions: { code: error.name, statusCode: error.statusCode, errorCode: error.code },
        });
    }
    if (error instanceof GraphQLError) {
        return error;
    }
    // Log the full error for debugging
    logger.error('Unhandled resolver error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return new GraphQLError('An unexpected error occurred', {
        extensions: { code: 'INTERNAL_SERVER_ERROR', statusCode: 500, errorCode: 10004 },
    });
}

export const authResolvers = {
    DateTime: DateTimeResolver,
    JSON: GraphQLJSON,

    Query: {
        me: async (_: unknown, __: unknown, context: GraphQLContext) => {
            try {
                const tokenData = requireAuth(context);
                const user = await UserRepo.findById(tokenData.userId);
                if (!user) throw ERRORS.USER_NOT_FOUND;
                return user;
            } catch (error) {
                throw toGraphQLError(error);
            }
        },
    },

    Mutation: {
        signup: async (_: unknown, { input }: { input: { name: string; email: string; password: string; role?: string } }) => {
            try {
                const { name, email, password, role } = input;

                if (!name || !email || !password) {
                    throw ERRORS.INVALID_REQUEST_BODY;
                }

                const existing = await UserRepo.findByEmail(email);
                if (existing) throw ERRORS.DUPLICATE_EMAIL;

                const passwordHash = await bcrypt.hash(password, 12);
                const insertId = await UserRepo.create(name, email, passwordHash, role || 'author');

                const user = await UserRepo.findById(insertId);
                if (!user) throw ERRORS.USER_CREATION_FAILED;

                const tokenData = { userId: user.id, email: user.email, is_admin: user.role === 'admin' };
                const token = createAuthToken(tokenData);
                const refreshToken = createRefreshToken(tokenData);

                return { token, refreshToken, user };
            } catch (error) {
                throw toGraphQLError(error);
            }
        },

        login: async (_: unknown, { input }: { input: { email: string; password: string } }) => {
            try {
                const { email, password } = input;

                if (!email || !password) {
                    throw ERRORS.INVALID_REQUEST_BODY;
                }

                const user = await UserRepo.findByEmail(email);
                if (!user) throw ERRORS.INVALID_CREDENTIALS;

                if (!user.is_active) throw ERRORS.FORBIDDEN;

                const valid = await bcrypt.compare(password, user.password_hash);
                if (!valid) throw ERRORS.INVALID_CREDENTIALS;

                const tokenData = { userId: user.id, email: user.email, is_admin: user.role === 'admin' };
                const token = createAuthToken(tokenData);
                const refreshToken = createRefreshToken(tokenData);

                const userView = toUserView(user);
                return { token, refreshToken, user: userView };
            } catch (error) {
                throw toGraphQLError(error);
            }
        },

        refreshToken: async (_: unknown, { token }: { token: string }) => {
            try {
                const decoded = decodeRefreshToken(token);
                const newToken = createAuthToken(decoded);
                return { token: newToken };
            } catch (error) {
                throw toGraphQLError(error);
            }
        },
    },
};
