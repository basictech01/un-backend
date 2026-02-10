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
    USER_UPDATE_FAILED: new RequestError("Failed to update user profile", 30003, 500),
    DUPLICATE_EMAIL: new RequestError("Email already exists", 30004, 409),
    USER_NOT_AUTHOR: new RequestError("User is not an author", 30006, 400),
    PAGINATION_LIMIT_EXCEEDED: new RequestError("Pagination limit must be between 1 and 100", 30007, 400),
    USER_ACCOUNT_DEACTIVATED: new RequestError("Your account has been deactivated. Please contact an administrator.", 30008, 403),
    USER_STATUS_TOGGLE_FAILED: new RequestError("Failed to update user active status", 30009, 500),
    USER_PASSWORD_UPDATE_FAILED: new RequestError("Failed to update password", 30010, 500),
    USER_SELF_DEACTIVATE: new RequestError("You cannot deactivate your own account", 30011, 400),
    USER_NAME_REQUIRED: new RequestError("User name is required", 30012, 400),
    USER_EMAIL_REQUIRED: new RequestError("User email is required", 30013, 400),
    USER_PASSWORD_REQUIRED: new RequestError("Password is required", 30014, 400),
    USER_PASSWORD_TOO_SHORT: new RequestError("Password must be at least 6 characters", 30015, 400),
    USER_INVALID_ROLE: new RequestError("Invalid user role", 30016, 400),

    // Article/Content Management Errors (4xxxx)
    ARTICLE_NOT_FOUND: new RequestError("Article not found", 40001, 404),
    ARTICLE_NOT_OWNED: new RequestError("You do not own this article", 40002, 403),
    REJECTION_REASON_REQUIRED: new RequestError("Rejection reason is required", 40004, 400),
    INVALID_SECTION: new RequestError("Invalid section", 40005, 400),
    INVALID_SUBSECTION: new RequestError("Invalid subsection for this section", 40006, 400),

    // Status transition errors — specific per operation
    ARTICLE_NOT_PENDING: new RequestError("Article is not pending approval", 40007, 400),
    ARTICLE_NOT_DRAFT: new RequestError("Article must be in draft status to submit", 40008, 400),
    ARTICLE_NOT_REJECTED: new RequestError("Article must be rejected to resubmit", 40009, 400),

    // Edit/update permission errors — tells exactly what failed
    ARTICLE_EDIT_NOT_ALLOWED: new RequestError("Article can only be edited in draft or rejected status", 40010, 400),
    ARTICLE_DELETE_NOT_DRAFT: new RequestError("Authors can only delete their own draft articles", 40011, 400),
    ARTICLE_ALREADY_APPROVED: new RequestError("Article is already approved", 40012, 400),
    ARTICLE_ALREADY_PENDING: new RequestError("Article is already pending review", 40013, 400),
    ARTICLE_ALREADY_REJECTED: new RequestError("Article is already rejected", 40014, 400),

    // CRUD failure errors — DB-level operation failures
    ARTICLE_CREATE_FAILED: new RequestError("Failed to create article", 40020, 500),
    ARTICLE_UPDATE_FAILED: new RequestError("Failed to update article", 40021, 500),
    ARTICLE_DELETE_FAILED: new RequestError("Failed to delete article", 40022, 500),
    ARTICLE_STATUS_UPDATE_FAILED: new RequestError("Failed to update article status", 40023, 500),
    ARTICLE_BULK_APPROVE_FAILED: new RequestError("Failed to bulk approve articles", 40024, 500),
    ARTICLE_BULK_DELETE_FAILED: new RequestError("Failed to bulk delete articles", 40025, 500),

    // Validation errors
    ARTICLE_TITLE_REQUIRED: new RequestError("Article title is required", 40030, 400),
    ARTICLE_CONTENT_REQUIRED: new RequestError("Article content is required", 40031, 400),
    ARTICLE_SECTION_REQUIRED: new RequestError("Article section is required", 40032, 400),
    ARTICLE_SUBSECTIONS_REQUIRED: new RequestError("At least one subsection is required", 40033, 400),
    ARTICLE_IDS_REQUIRED: new RequestError("At least one article ID is required", 40034, 400),

    // View tracking
    ARTICLE_VIEW_INCREMENT_FAILED: new RequestError("Failed to record article view", 40040, 500),

    // File/Image Upload Errors (5xxxx)
    FILE_NOT_FOUND: new RequestError("No file uploaded", 50001, 400),
    FILE_UPLOAD_FAILED: new RequestError("File upload failed", 50002, 500),
    INVALID_FILE_TYPE: new RequestError("Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed", 50003, 400),
    FILE_TOO_LARGE: new RequestError("File size exceeds the 5MB limit", 50004, 400),
    AZURE_UPLOAD_FAILED: new RequestError("Failed to upload image to storage", 50005, 500),
    AZURE_DELETE_FAILED: new RequestError("Failed to delete image from storage", 50006, 500),
    AZURE_NOT_CONFIGURED: new RequestError("Image storage is not configured", 50007, 500),
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
