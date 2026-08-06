"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Search, Loader2 } from "lucide-react";

/**
 * AddressPicker — the delivery address must come FROM the map (Mapbox).
 *
 * - Type in the search box → debounced Mapbox geocoding → pick a suggestion.
 * - Click the map or drag the marker → reverse geocode → address filled in.
 * - The chosen address is always a real Mapbox place name, so the admin API's
 *   server-side address validation always passes.
 *
 * Mapbox GL JS is loaded at runtime from the Mapbox CDN (no npm package).
 * Requires NEXT_PUBLIC_MAPBOX_TOKEN in the environment. Without a token the
 * component falls back to a plain textarea so the form still works.
 */

const MAPBOX_GL_VERSION = "v3.9.4";
const SCRIPT_SRC = `https://api.mapbox.com/mapbox-gl-js/${MAPBOX_GL_VERSION}/mapbox-gl.js`;
const CSS_SRC = `https://api.mapbox.com/mapbox-gl-js/${MAPBOX_GL_VERSION}/mapbox-gl.css`;

/* ── Minimal typings for the CDN global (no @types dependency) ── */
interface MapboxMapLike {
  on(event: string, cb: (e: { lngLat: { lat: number; lng: number } }) => void): void;
  remove(): void;
  getZoom(): number;
  flyTo(opts: { center: [number, number]; zoom?: number; duration?: number }): void;
}
interface MapboxMarkerLike {
  setLngLat(l: { lat: number; lng: number }): MapboxMarkerLike;
  getLngLat(): { lat: number; lng: number };
  addTo(map: MapboxMapLike): MapboxMarkerLike;
  on(event: string, cb: () => void): void;
}
interface MapboxGLGlobal {
  accessToken: string;
  Map: new (opts: {
    container: HTMLElement;
    style: string;
    center: [number, number];
    zoom: number;
  }) => MapboxMapLike;
  Marker: new (opts?: { color?: string; draggable?: boolean }) => MapboxMarkerLike;
}

declare global {
  interface Window {
    mapboxgl?: MapboxGLGlobal;
  }
}

/** Inject the CDN stylesheet + script once; resolves with the global. */
function loadMapboxGL(): Promise<MapboxGLGlobal> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.mapboxgl) return resolve(window.mapboxgl);

    if (!document.getElementById("mapbox-gl-css")) {
      const link = document.createElement("link");
      link.id = "mapbox-gl-css";
      link.rel = "stylesheet";
      link.href = CSS_SRC;
      document.head.appendChild(link);
    }

    const existing = document.getElementById("mapbox-gl-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => window.mapboxgl && resolve(window.mapboxgl), { once: true });
      existing.addEventListener("error", () => reject(new Error("Mapbox script failed to load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "mapbox-gl-js";
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.mapboxgl ? resolve(window.mapboxgl) : reject(new Error("no mapboxgl global")));
    script.onerror = () => reject(new Error("Mapbox script failed to load"));
    document.head.appendChild(script);
  });
}

interface AddressPickerProps {
  /** Mapbox public token (NEXT_PUBLIC_MAPBOX_TOKEN). */
  token: string;
  /** Current address value (validated Mapbox place name after a pick). */
  value: string;
  /** Called with the validated address whenever the user picks from map/search. */
  onChange: (address: string) => void;
}

export function AddressPicker({ token, value, onChange }: AddressPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMapLike | null>(null);
  const markerRef = useRef<MapboxMarkerLike | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mapState, setMapState] = useState<"loading" | "ready" | "error">(token ? "loading" : "error");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ place: string; center: [number, number] }[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSug, setShowSug] = useState(false);

  /* ── Map init (CDN, once per token) ── */
  useEffect(() => {
    if (!containerRef.current || !token) return;
    let disposed = false;
    let map: MapboxMapLike | null = null;

    loadMapboxGL()
      .then((mapboxgl) => {
        if (disposed || !containerRef.current) return;
        mapboxgl.accessToken = token;
        map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [3.3792, 6.5244], // Lagos
          zoom: 10,
        });
        const marker = new mapboxgl.Marker({ color: "#b91c1c", draggable: true })
          .setLngLat({ lat: 6.5244, lng: 3.3792 })
          .addTo(map);
        mapRef.current = map;
        markerRef.current = marker;
        setMapState("ready");

        const reversePick = (lat: number, lng: number) => reverseGeocode(lat, lng);
        map.on("click", (e) => {
          marker.setLngLat({ lat: e.lngLat.lat, lng: e.lngLat.lng });
          reversePick(e.lngLat.lat, e.lngLat.lng);
        });
        marker.on("dragend", () => {
          const l = marker.getLngLat();
          reversePick(l.lat, l.lng);
        });
      })
      .catch(() => {
        if (!disposed) setMapState("error");
      });

    return () => {
      disposed = true;
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /* ── Reverse geocode a clicked/dropped point → validated address ── */
  const reverseGeocode = async (lat: number, lng: number) => {
    if (!token) return;
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
          `?access_token=${encodeURIComponent(token)}&country=ng&limit=1`,
      );
      const json = await res.json();
      const f = json?.features?.[0];
      if (f?.place_name) onChange(f.place_name);
    } catch {
      // Keep the current value on network failure.
    }
  };

  /* ── Forward geocode the typed query (debounced) ── */
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || !token) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
            `?access_token=${encodeURIComponent(token)}&country=ng&limit=5` +
            "&types=address,place,locality,neighborhood,poi,region",
        );
        const json = await res.json();
        setSuggestions(
          (json?.features || []).map((f: { place_name?: string; center?: number[] }) => ({
            place: f.place_name || "",
            center: [f.center?.[0] ?? 0, f.center?.[1] ?? 0] as [number, number],
          })),
        );
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, token]);

  /* ── Pick a suggestion → validated address + move the marker ── */
  const pick = (place: string, center?: [number, number]) => {
    onChange(place);
    setQuery("");
    setShowSug(false);
    if (center && mapRef.current && markerRef.current) {
      markerRef.current.setLngLat({ lat: center[1], lng: center[0] });
      mapRef.current.flyTo({ center: [center[0], center[1]], zoom: Math.max(mapRef.current.getZoom(), 13), duration: 800 });
    }
  };

  /* ── No token configured → plain textarea fallback ── */
  if (!token) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder="Street, area, city, state"
        className="mt-2 w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none resize-none"
      />
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {/* Search box + suggestions */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thread" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowSug(true);
          }}
          onFocus={() => setShowSug(true)}
          onBlur={() => setTimeout(() => setShowSug(false), 200)}
          placeholder="Search your delivery address…"
          className="w-full bg-bone border border-hairline pl-10 pr-4 py-3 text-sm text-ink focus:border-laser outline-none"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-laser animate-spin" />}
        {showSug && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full bg-bone border border-hairline shadow-lg max-h-56 overflow-y-auto">
            {suggestions.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onMouseDown={() => pick(s.place, s.center)}
                  className="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-vellum flex items-start gap-2"
                >
                  <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-thread" />
                  <span className="break-words">{s.place}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Mini map — click or drag the pin to set the address */}
      {mapState === "error" ? (
        <p className="text-xs text-thread border border-hairline p-3">
          The map could not be loaded — you can still pick an address from the search results above.
        </p>
      ) : (
        <div className="relative">
          <div ref={containerRef} className="h-44 w-full border border-hairline" data-testid="address-picker-map" />
          {mapState === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-thread bg-bone/60">
              Loading map…
            </div>
          )}
        </div>
      )}

      {/* Chosen address */}
      {value && (
        <p className="text-xs text-thread flex items-start gap-1.5">
          <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-laser" />
          <span className="break-words">{value}</span>
        </p>
      )}
    </div>
  );
}
