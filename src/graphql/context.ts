import { GraphQLError } from 'graphql';
import { Request } from 'express';

export interface TokenData {
    userId: number;
    email: string;
    is_admin?: boolean;
}

export interface GraphQLContext {
    req: Request;
    user: TokenData | null;
}

export function requireAuth(context: GraphQLContext): TokenData {
    if (!context.user) {
        throw new GraphQLError('Unauthorized', {
            extensions: { code: 'UNAUTHORIZED', statusCode: 401, errorCode: 20005 },
        });
    }
    return context.user;
}

export function requireAdmin(context: GraphQLContext): TokenData {
    const user = requireAuth(context);
    if (!user.is_admin) {
        throw new GraphQLError('Admin access required', {
            extensions: { code: 'FORBIDDEN', statusCode: 403, errorCode: 20007 },
        });
    }
    return user;
}
