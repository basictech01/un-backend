import { BlobServiceClient } from '@azure/storage-blob';
import { createHmac } from 'crypto';
import { err, ok, Result } from 'neverthrow';
import { AZURE_STORAGE_CONNECTION_STRING, AZURE_CONTAINER_NAME, FILE_CREATION_SECRET_KEY } from '../config/env.ts';
import { ERRORS, RequestError } from './error.ts';
import createLogger from './logger.ts';

const logger = createLogger('@upload');

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function createFileName(seed: number): string {
    const hash = createHmac('sha256', FILE_CREATION_SECRET_KEY)
        .update(seed.toString())
        .digest('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 16);
    return hash;
}

function getContainerClient() {
    if (!AZURE_STORAGE_CONNECTION_STRING) {
        return null;
    }
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    return blobServiceClient.getContainerClient(AZURE_CONTAINER_NAME);
}

export function validateImageFile(
    file: { mimetype: string; size: number } | undefined | null,
): Result<void, RequestError> {
    if (!file) {
        return err(ERRORS.FILE_NOT_FOUND);
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        return err(ERRORS.INVALID_FILE_TYPE);
    }
    if (file.size > MAX_FILE_SIZE) {
        return err(ERRORS.FILE_TOO_LARGE);
    }
    return ok(undefined);
}

export async function uploadImageToBlob(
    buffer: Buffer,
    mimetype: string,
): Promise<Result<string, RequestError>> {
    try {
        const containerClient = getContainerClient();
        if (!containerClient) {
            return err(ERRORS.AZURE_NOT_CONFIGURED);
        }

        const fileName = createFileName(Date.now());
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);

        await blockBlobClient.uploadData(buffer, {
            blobHTTPHeaders: { blobContentType: mimetype },
        });

        return ok(blockBlobClient.url);
    } catch (error) {
        logger.error('Azure upload failed:', error);
        return err(ERRORS.AZURE_UPLOAD_FAILED);
    }
}

export async function deleteImageFromBlob(url: string): Promise<Result<void, RequestError>> {
    try {
        const containerClient = getContainerClient();
        if (!containerClient) {
            return err(ERRORS.AZURE_NOT_CONFIGURED);
        }

        // Extract blob name from URL
        const blobName = url.split('/').pop();
        if (!blobName) {
            return err(ERRORS.AZURE_DELETE_FAILED);
        }

        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.deleteIfExists();

        return ok(undefined);
    } catch (error) {
        logger.error('Azure delete failed:', error);
        return err(ERRORS.AZURE_DELETE_FAILED);
    }
}
