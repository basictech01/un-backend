import { GraphQLError } from 'graphql';

export class RequestError extends Error {
    code: number;
    statusCode: number;

    constructor(message: string, code: number, statusCode: number) {
        super(message);
        this.name = 'RequestError';
        this.code = code;
        this.statusCode = statusCode;

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, RequestError);
        }
    }
}

/*
HTTP Status Codes Reference:
200 OK - Response to a successful GET, PUT, PATCH or DELETE
201 Created - Response to a POST that results in a creation
204 No Content - Response to a successful request that won't be returning a body
304 Not Modified - Used when HTTP caching headers are in play
400 Bad Request - The request is malformed, such as if the body does not parse
401 Unauthorized - When no or invalid authentication details are provided
403 Forbidden - When authentication succeeded but authenticated user doesn't have access to the resource
404 Not Found - When a non-existent resource is requested
405 Method Not Allowed - When an HTTP method is being requested that isn't allowed for the authenticated user
410 Gone - Indicates that the resource at this end point is no longer available
415 Unsupported Media Type - If incorrect content type was provided as part of the request
422 Unprocessable Entity - Used for validation errors
429 Too Many Requests - When a request is rejected due to rate limiting
500 Internal Server Error - This is either a system or application error
503 Service Unavailable - The server is unable to handle the request for a service due to temporary maintenance
*/

/*
Error Code Convention:
- 1xxxx: Common/General errors
- 2xxxx: Authentication & Authorization errors
- 3xxxx: User management errors
- 4xxxx: Article/Content management errors
- 5xxxx: File/Media service errors
- 6xxxx: Advertisement service errors
*/

export const ERRORS = {
    // Common Errors (1xxxx)
    DATABASE_ERROR: new RequestError("Database operation failed", 10001, 500),
    INVALID_REQUEST_BODY: new RequestError("Invalid request body", 10002, 400),
    UNHANDLED_ERROR: new RequestError("An unexpected error occurred", 10004, 500),

    // Authentication & Authorization Errors (2xxxx)
    INVALID_AUTH_TOKEN: new RequestError("Invalid authentication token", 20002, 401),
    TOKEN_EXPIRED: new RequestError("Authentication token has expired", 20003, 401),
    INVALID_REFRESH_TOKEN: new RequestError("Invalid refresh token", 20004, 401),
    UNAUTHORIZED: new RequestError("Unauthorized access", 20005, 401),
    FORBIDDEN: new RequestError("Access forbidden", 20006, 403),
    ADMIN_ONLY_ROUTE: new RequestError("Admin access required", 20007, 403),
    INVALID_CREDENTIALS: new RequestError("Invalid email or password", 20010, 401),

    // User Management Errors (3xxxx)
    USER_NOT_FOUND: new RequestError("User not found", 30001, 404),
    USER_CREATION_FAILED: new RequestError("Failed to create user", 30002, 500),
    USER_UPDATE_FAILED: new RequestError("Failed to update user", 30003, 500),
    DUPLICATE_EMAIL: new RequestError("Email already exists", 30004, 409),
    USER_NOT_AUTHOR: new RequestError("User is not an author", 30006, 400),
    PAGINATION_LIMIT_EXCEEDED: new RequestError("Pagination limit must be between 1 and 100", 30007, 400),
} as const;

// Convert RequestError to GraphQLError for resolver/context usage
function statusToGraphQLCode(statusCode: number): string {
    switch (statusCode) {
        case 400: return 'BAD_USER_INPUT';
        case 401: return 'UNAUTHORIZED';
        case 403: return 'FORBIDDEN';
        case 404: return 'NOT_FOUND';
        case 409: return 'DUPLICATE_RESOURCE';
        case 422: return 'BAD_USER_INPUT';
        default: return 'INTERNAL_SERVER_ERROR';
    }
}

export function toGraphQLError(error: RequestError): GraphQLError {
    return new GraphQLError(error.message, {
        extensions: {
            code: statusToGraphQLCode(error.statusCode),
            statusCode: error.statusCode,
            errorCode: error.code,
        },
    });
}

// Helper function to check if error is a RequestError
export function isRequestError(error: any): error is RequestError {
    return error instanceof RequestError;
}

// Helper function to handle unknown errors
export function handleUnknownError(error: any): RequestError {
    if (isRequestError(error)) {
        return error;
    }

    console.error('Unknown error:', error);
    return ERRORS.UNHANDLED_ERROR;
}
