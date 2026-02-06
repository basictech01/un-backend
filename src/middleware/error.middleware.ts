import { Request, Response, NextFunction } from 'express';
import { RequestError } from '../utils/error.ts';
import { errorResponse } from '../utils/response.ts';
import { NODE_ENV } from '../config/env.ts';

export const errorHandler = (
    error: Error | RequestError,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    console.error(`Error: ${error.message}`, {
        stack: error.stack,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString(),
    });

    if (error instanceof RequestError) {
        res.status(error.statusCode).json(
            errorResponse(error.message, error.code)
        );
        return;
    }

    // Handle JWT specific errors
    if (error.name === 'JsonWebTokenError') {
        res.status(401).json(
            errorResponse('Invalid authentication token', 20002)
        );
        return;
    }

    if (error.name === 'TokenExpiredError') {
        res.status(401).json(
            errorResponse('Authentication token has expired', 20003)
        );
        return;
    }

    // Handle syntax errors in JSON
    if (error instanceof SyntaxError && 'body' in error) {
        res.status(400).json(
            errorResponse('Invalid JSON in request body', 10002)
        );
        return;
    }

    // Handle any other unexpected errors
    res.status(500).json(
        errorResponse(
            NODE_ENV === 'production' ? 'Internal server error' : error.message,
            10004
        )
    );
};

// 404 Not Found handler
export const notFoundHandler = (req: Request, res: Response) => {
    res.status(404).json({
        success: false,
        error: {
            code: 10006,
            message: `Route ${req.method} ${req.path} not found`
        }
    });
};
