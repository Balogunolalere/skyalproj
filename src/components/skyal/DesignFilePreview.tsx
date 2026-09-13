"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Preview thumbnails for locally-attached design files.
 *
 * `uploadFiles` holds `FileReader.readAsDataURL` results, so the image bytes
 * are ALREADY in the browser at review time — we can show the customer what
 * they picked without uploading or waiting for a Cloudinary URL. That matters
 * because the review step is the last chance to catch a wrong file.
 */
export interface DesignFile {
  name: string;
  /** `data:<mime>;base64,…` — the shape `FileReader.readAsDataURL` returns. */
  data: string;
}

/** True when the browser can render the attachment inline (png/jpeg/webp/gif/svg). */
export function isImageDataUrl(data: string): boolean {
  return /^data:image\//i.test(data);
}

/** Extension badge for attachments we can't rasterise (PDF, AI, EPS, DXF). */
function extensionLabel(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toUpperCase() : "FILE";
}

/**
 * Thumbnail strip for attached design files. Images render as a preview and
 * open full-size on click; anything else shows its extension instead. Shared
 * by the picker step and the review step so both stay in sync.
 */
export function DesignFileThumbs({
  files,
  className = "",
}: {
  files: DesignFile[];
  className?: string;
}) {
  const [zoomed, setZoomed] = useState<DesignFile | null>(null);

  // Escape closes the enlarged view.
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomed(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  if (files.length === 0) return null;

  return (
    <>
      <ul className={`flex flex-wrap gap-2 ${className}`}>
        {files.map((file, i) => {
          const image = isImageDataUrl(file.data);
          return (
            <li key={`${file.name}-${i}`}>
              <button
                type="button"
                onClick={() => image && setZoomed(file)}
                disabled={!image}
                title={image ? `${file.name} — click to enlarge` : file.name}
                aria-label={image ? `Enlarge ${file.name}` : file.name}
                className={`block w-16 h-16 border border-hairline bg-vellum overflow-hidden transition-colors ${
                  image ? "cursor-zoom-in hover:border-laser" : "cursor-default"
                }`}
              >
                {image ? (
                  <img
                    src={file.data}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="w-full h-full flex items-center justify-center font-mono text-[9px] uppercase tracking-[0.12em] text-thread">
                    {extensionLabel(file.name)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Portalled to <body>: the surrounding view uses framer-motion transforms,
          which would otherwise become the containing block for position:fixed. */}
      {zoomed &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Preview of ${zoomed.name}`}
            onClick={() => setZoomed(null)}
            className="fixed inset-0 z-[100] bg-ink/90 flex flex-col items-center justify-center gap-5 p-6 cursor-zoom-out"
          >
            <img
              src={zoomed.data}
              alt={zoomed.name}
              onClick={(event) => event.stopPropagation()}
              className="max-w-full max-h-[80vh] object-contain cursor-default"
            />
            <div className="flex items-center gap-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone/70">
                {zoomed.name}
              </span>
              <button
                type="button"
                onClick={() => setZoomed(null)}
                className="inline-flex items-center gap-1.5 text-xs text-bone/70 hover:text-bone transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Close
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
