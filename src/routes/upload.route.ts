import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { decodeAuthToken } from '../utils/jwt.ts';
import { ERRORS } from '../utils/error.ts';
import { successResponse, errorResponse } from '../utils/response.ts';
import { validateImageFile, uploadImageToBlob } from '../utils/upload.ts';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Auth middleware for REST route
function requireAuthRest(req: Request, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json(errorResponse(ERRORS.UNAUTHORIZED.message, ERRORS.UNAUTHORIZED.code));
            return;
        }
        const token = authHeader.substring(7);
        req.user = decodeAuthToken(token);
        next();
    } catch {
        res.status(401).json(errorResponse(ERRORS.UNAUTHORIZED.message, ERRORS.UNAUTHORIZED.code));
    }
}

// Multer middleware wrapper to handle MulterError explicitly
function uploadMiddleware(req: Request, res: Response, next: NextFunction) {
    upload.single('image')(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                res.status(400).json(errorResponse(ERRORS.FILE_TOO_LARGE.message, ERRORS.FILE_TOO_LARGE.code));
            } else {
                res.status(400).json(errorResponse(err.message, 50000));
            }
            return;
        }
        if (err) {
            next(err);
            return;
        }
        next();
    });
}

router.post(
    '/',
    requireAuthRest,
    uploadMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Validate the file
            const validation = validateImageFile(req.file);
            if (validation.isErr()) {
                const e = validation.error;
                res.status(e.statusCode).json(errorResponse(e.message, e.code));
                return;
            }

            // Upload to Azure Blob
            const result = await uploadImageToBlob(req.file!.buffer, req.file!.mimetype);
            if (result.isErr()) {
                const e = result.error;
                res.status(e.statusCode).json(errorResponse(e.message, e.code));
                return;
            }

            res.json(successResponse({ url: result.value }, 'Image uploaded successfully'));
        } catch (error) {
            next(error);
        }
    },
);

export default router;
