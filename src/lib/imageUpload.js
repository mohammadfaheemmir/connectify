export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const QUALITY = 0.85;

const EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
};

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function readSize(file) {
    try {
        const bitmap = await createImageBitmap(file);
        const size = { width: bitmap.width, height: bitmap.height };
        bitmap.close?.();
        return size;
    } catch {
        return null;
    }
}

// Shrinks large photos to at most 1600px on the long side before upload.
// GIFs are left alone so animations survive. Returns { blob, type, width, height }.
export async function prepareImage(file) {
    if (file.type === 'image/gif') {
        const size = await readSize(file);
        return { blob: file, type: file.type, ...(size ?? { width: 0, height: 0 }) };
    }

    let bitmap;
    try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
        return { blob: file, type: file.type, width: 0, height: 0 };
    }

    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    // WebP keeps transparency and is small; fall back if the browser can't encode it.
    let blob = await canvasToBlob(canvas, 'image/webp', QUALITY);
    if (!blob || blob.type !== 'image/webp') {
        blob = file.type === 'image/png'
            ? await canvasToBlob(canvas, 'image/png')
            : await canvasToBlob(canvas, 'image/jpeg', QUALITY);
    }

    // Keep the original if re-encoding didn't help.
    if (!blob || (scale === 1 && blob.size >= file.size)) {
        return { blob: file, type: file.type, width, height };
    }

    return { blob, type: blob.type, width, height };
}

// Storage path with a safe random name. The pixel size is part of the name so
// the feed can reserve the right amount of space before the image loads.
export function buildImagePath(userId, { type, width, height }) {
    const ext = EXTENSIONS[type] ?? 'jpg';
    const size = width && height ? `_${width}x${height}` : '';
    return `${userId}/${crypto.randomUUID()}${size}.${ext}`;
}

// Reads the size back out of an image URL created by buildImagePath.
export function sizeFromImageUrl(url) {
    const match = /_(\d{2,5})x(\d{2,5})\.[a-z]+(?:\?|$)/i.exec(url || '');
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
}
