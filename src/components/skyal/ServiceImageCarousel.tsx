'use client';

import { useRef, useState } from 'react';
import { cloudinaryImage } from '@/lib/images';

/**
 * Swipeable product photos for a service card.
 *
 * Swipe left/right on touch, use the arrows on desktop, or click the photo /
 * expand button for a full-screen viewer. The viewer keeps the same gesture and
 * arrow controls so a customer can browse all four examples comfortably.
 */
export function ServiceImageCarousel({ images, alt }: { images?: string[] | null; alt: string }) {
  const gallery = (images ?? []).filter((url): url is string => typeof url === 'string' && url.length > 0);
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const touchStartX = useRef<number | null>(null);

  if (gallery.length === 0) return null;
  const count = gallery.length;
  const safeIndex = Math.min(index, count - 1);

  function go(delta: number) {
    setIndex((current) => (current + delta + count) % count);
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const delta = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
    touchStartX.current = null;
  }

  return (
    <>
      <div
        className="relative w-full h-36 overflow-hidden mb-3 bg-vellum group"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setExpanded(true); } }}
        aria-label={`View ${alt} photos`}
      >
        <img
          src={cloudinaryImage(gallery[safeIndex], 480)}
          srcSet={`${cloudinaryImage(gallery[safeIndex], 320)} 320w, ${cloudinaryImage(gallery[safeIndex], 640)} 640w`}
          sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 92vw"
          alt={`${alt} — photo ${safeIndex + 1}`}
          loading="lazy"
          decoding="async"
          width={640}
          height={288}
          className="w-full h-full object-cover"
        />

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
          className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white opacity-90 hover:opacity-100"
          aria-label="Expand photos"
        >
          <span className="text-xs leading-none" aria-hidden>⤢</span>
        </button>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(-1); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white opacity-80 hover:opacity-100"
              aria-label="Previous photo"
            >
              <span className="text-lg leading-none" aria-hidden>‹</span>
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(1); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white opacity-80 hover:opacity-100"
              aria-label="Next photo"
            >
              <span className="text-lg leading-none" aria-hidden>›</span>
            </button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
              {gallery.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${i === safeIndex ? 'bg-white' : 'bg-white/45'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} photos`}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close photos"
          >
            <span className="text-xl leading-none" aria-hidden>×</span>
          </button>
          <img
            src={cloudinaryImage(gallery[safeIndex], 1600)}
            alt={`${alt} — photo ${safeIndex + 1}`}
            decoding="async"
            className="max-h-[85vh] max-w-[92vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {count > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(-1); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                aria-label="Previous photo"
              >
                <span className="text-2xl leading-none" aria-hidden>‹</span>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(1); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                aria-label="Next photo"
              >
                <span className="text-2xl leading-none" aria-hidden>›</span>
              </button>
              <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2">
                {gallery.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIndex(i); }}
                    className={`h-2 w-2 rounded-full ${i === safeIndex ? 'bg-white' : 'bg-white/40'}`}
                    aria-label={`Show photo ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
