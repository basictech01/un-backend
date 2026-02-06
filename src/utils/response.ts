// Standard success response format
export function successResponse(data: any, message?: string) {
    return {
        success: true,
        message: message || "Operation successful",
        data,
        timestamp: new Date().toISOString()
    };
}

// Standard error response format
export function errorResponse(message: string, code: number = 10000) {
    return {
        success: false,
        error: {
            code,
            message
        },
        timestamp: new Date().toISOString()
    };
}

// Response for list operations
export function listResponse(data: any[], message?: string, meta?: any) {
    return {
        success: true,
        message: message || "Data retrieved successfully",
        data,
        meta: meta || { count: data.length },
        timestamp: new Date().toISOString()
    };
}

// Response for creation operations
export function createdResponse(data: any, message?: string) {
    return {
        success: true,
        message: message || "Resource created successfully",
        data,
        timestamp: new Date().toISOString()
    };
}

// Response for update operations
export function updatedResponse(data: any, message?: string) {
    return {
        success: true,
        message: message || "Resource updated successfully",
        data,
        timestamp: new Date().toISOString()
    };
}

// Response for delete operations
export function deletedResponse(message?: string) {
    return {
        success: true,
        message: message || "Resource deleted successfully",
        timestamp: new Date().toISOString()
    };
}

// Response for authentication operations
export function authResponse(data: { user: any; token: string }, message?: string) {
    return {
        success: true,
        message: message || "Authentication successful",
        data: {
            user: data.user,
            token: data.token,
        },
        timestamp: new Date().toISOString(),
    };
}

// Empty success response
export function emptyResponse(message?: string) {
    return {
        success: true,
        message: message || "Operation completed successfully",
        timestamp: new Date().toISOString(),
    };
}

// Pagination metadata type
export interface PaginationMeta {
    totalItems: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
}

// Build pagination meta from raw values
export function buildPaginationMeta(
    totalItems: number,
    page: number,
    limit: number,
): PaginationMeta {
    const totalPages = Math.ceil(totalItems / limit) || 1;
    return {
        totalItems,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
    };
}

// Standard paginated response
export function paginatedResponse(
    data: any[],
    pagination: PaginationMeta,
    message?: string,
) {
    return {
        success: true,
        message: message || "Data retrieved successfully",
        data,
        pagination,
        timestamp: new Date().toISOString(),
    };
}
