import { Request } from 'express';
import { TokenData } from '../utils/jwt.ts';
import { ERRORS, toGraphQLError } from '../utils/error.ts';
import { Loaders } from './loaders/user.loader.ts';

export type { TokenData };

export interface GraphQLContext {
    req: Request;
    user: TokenData | null;
    loaders: Loaders;
}

export function requireAuth(context: GraphQLContext): TokenData {
    if (!context.user) {
        throw toGraphQLError(ERRORS.UNAUTHORIZED);
    }
    return context.user;
}

export function requireAdmin(context: GraphQLContext): TokenData {
    const user = requireAuth(context);
    if (!user.is_admin) {
        throw toGraphQLError(ERRORS.ADMIN_ONLY_ROUTE);
    }
    return user;
}
