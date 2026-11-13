/**
 * Serve a resized, auto-formatted Cloudinary copy instead of the original
 * upload.
 *
 * Service photos are 1–3 MB PNGs. A service card renders one at ~320 px wide,
 * so the browser was downloading roughly 20× more bytes than it can display.
 * `f_auto` lets Cloudinary pick WebP/AVIF per browser, `q_auto` picks a sane
 * quality. Non-Cloudinary URLs (and already-transformed ones) pass through
 * untouched.
 */
export function cloudinaryImage(url: string, width: number): string {
  if (!url.includes('res.cloudinary.com/')) return url;
  // Only untransformed URLs look like `/image/upload/v123/…`; replacing that
  // marker is idempotent, so calling this twice never stacks transformations.
  return url.replace('/image/upload/v', `/image/upload/f_auto,q_auto,w_${width}/v`);
}
