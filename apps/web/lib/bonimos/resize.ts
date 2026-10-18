'use client';

/**
 * Client-side image resizing for the site-photo feed: decode (EXIF rotation
 * applied), draw onto a canvas at most `maxEdge` px on the long side, and
 * re-encode as JPEG. Re-encoding also drops the EXIF metadata (GPS position
 * of the plot, device) before anything leaves the phone. Browser only.
 */
import { fitWithin, PHOTO_MAX_EDGE, PHOTO_QUALITY, THUMB_MAX_EDGE, THUMB_QUALITY } from './photos';

export interface ResizedImage {
  blob: Blob;
  width: number;
  height: number;
}

type Drawable = { source: CanvasImageSource; width: number; height: number; close?: () => void };

async function decode(file: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Fall through to <img> (older Safari, unusual encodings).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/jpeg', quality);
  });
}

function draw(img: Drawable, maxEdge: number): HTMLCanvasElement {
  const size = fitWithin(img.width, img.height, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  // White under transparent PNGs (JPEG has no alpha).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img.source, 0, 0, size.width, size.height);
  return canvas;
}

/** The stored photo (≤ 1,600 px) and its thumbnail (≤ 480 px), from one decode. */
export async function resizeForUpload(file: Blob): Promise<{ photo: ResizedImage; thumb: ResizedImage }> {
  const img = await decode(file);
  try {
    if (!img.width || !img.height) throw new Error('empty image');
    const big = draw(img, PHOTO_MAX_EDGE);
    const small = draw(img, THUMB_MAX_EDGE);
    const [photoBlob, thumbBlob] = await Promise.all([encode(big, PHOTO_QUALITY), encode(small, THUMB_QUALITY)]);
    return {
      photo: { blob: photoBlob, width: big.width, height: big.height },
      thumb: { blob: thumbBlob, width: small.width, height: small.height },
    };
  } finally {
    img.close?.();
  }
}
