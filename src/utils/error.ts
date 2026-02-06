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
400 Bad Request - The request is malformed, such as if the body does not parse
401 Unauthorized - When no or invalid authentication details are provided
403 Forbidden - When authentication succeeded but authenticated user doesn't have access to the resource
404 Not Found - When a non-existent resource is requested
422 Unprocessable Entity - Used for validation errors
429 Too Many Requests - When a request is rejected due to rate limiting
500 Internal Server Error - This is either a system or application error
*/

/*
Error Code Convention:
- 1xxxx: Common/General errors
- 2xxxx: Authentication & Authorization errors
- 3xxxx: User management errors
- 4xxxx: Hotel management errors
- 5xxxx: Booking management errors
- 6xxxx: Review management errors
- 7xxxx: Payment errors
*/

export const ERRORS = {
    // Common Errors (1xxxx)
    DATABASE_ERROR: new RequestError("Database operation failed", 10001, 500),
    INVALID_REQUEST_BODY: new RequestError("Invalid request body", 10002, 400),
    INVALID_QUERY_PARAMETER: new RequestError("Invalid query parameters", 10003, 400),
    UNHANDLED_ERROR: new RequestError("An unexpected error occurred", 10004, 500),
    INTERNAL_SERVER_ERROR: new RequestError("Internal server error", 10005, 500),
    VALIDATION_ERROR: new RequestError("Validation failed", 10006, 422),
    RESOURCE_NOT_FOUND: new RequestError("Resource not found", 10007, 404),
    DUPLICATE_RESOURCE: new RequestError("Resource already exists", 10008, 409),

    // Authentication & Authorization Errors (2xxxx)
    NO_TOKEN_PROVIDED: new RequestError("No authentication token provided", 20001, 401),
    INVALID_AUTH_TOKEN: new RequestError("Invalid authentication token", 20002, 401),
    TOKEN_EXPIRED: new RequestError("Authentication token has expired", 20003, 401),
    INVALID_REFRESH_TOKEN: new RequestError("Invalid refresh token", 20004, 401),
    UNAUTHORIZED: new RequestError("Unauthorized access", 20005, 401),
    FORBIDDEN: new RequestError("Access forbidden", 20006, 403),
    JWT_SECRET_NOT_CONFIGURED: new RequestError("JWT configuration error", 20007, 500),
    INVALID_CREDENTIALS: new RequestError("Invalid email or password", 20008, 401),

    // User Management Errors (3xxxx)
    USER_NOT_FOUND: new RequestError("User not found", 30001, 404),
    USER_CREATION_FAILED: new RequestError("Failed to create user", 30002, 500),
    USER_UPDATE_FAILED: new RequestError("Failed to update user", 30003, 500),
    DUPLICATE_EMAIL: new RequestError("Email already exists", 30004, 409),
    INVALID_USER_DATA: new RequestError("Invalid user data", 30005, 400),
} as const;

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
