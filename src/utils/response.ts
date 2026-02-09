export function successResponse<T>(data: T, message?: string) {
    return {
        success: true,
        message: message || "Operation successful",
        data,
        timestamp: new Date().toISOString()
    };
}

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
