import rateLimit from 'express-rate-limit';
import { RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX } from '../config/env.ts';

export const limiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS, // 15 minutes by default
    max: RATE_LIMIT_MAX, // limit each IP to 100 requests per windowMs
    message: {
        success: false,
        error: {
            code: 42901,
            message: 'Too many requests, please try again later'
        }
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
