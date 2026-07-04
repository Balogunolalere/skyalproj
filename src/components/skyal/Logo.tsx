"use client";

/* The original Skyal wordmark — Pacifico script, with the laser-cut
   squiggle beneath acting as a kerf mark. Kept as the brand established
   it, in the company periwinkle. */
export function Logo({
  className = "",
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <span
      className={`relative inline-flex flex-col items-center leading-none ${className}`}
      style={{ fontFamily: "var(--font-pacifico), cursive" }}
    >
      <span
        className={`relative z-10 ${onDark ? "text-bone" : "text-laser"}`}
        style={{ paddingBottom: "0.18em", paddingTop: "0.06em" }}
      >
        Skyal
      </span>
      <svg
        className="absolute left-0 w-full text-current"
        style={{ bottom: "-0.05em", height: "0.4em" }}
        viewBox="0 0 100 20"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M 5,12 Q 40,22 95,5 Q 40,17 5,12"
          fill={onDark ? "var(--bone)" : "var(--laser)"}
          opacity={onDark ? 0.85 : 1}
        />
      </svg>
    </span>
  );
}
