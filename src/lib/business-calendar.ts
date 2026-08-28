/**
 * Business calendar — mirrors the admin backend's `src/lib/business-calendar.ts`.
 *
 * The shop's working schedule is CONFIGURABLE on the admin Settings page:
 *  - `working_day_open` / `working_day_close` (Lagos time, e.g. 08:00 / 17:00)
 *  - `observed_holidays` — the public holidays this business actually observes
 *    (JSON array of "YYYY-MM-DD" dates or { date, name } entries)
 *
 * These are exposed publicly by GET /api/settings?brand=SKYAL (the calendar is
 * business-wide, stored under the SKYAL brand row). Everything here mirrors
 * the backend rules:
 *  - a pickup must be a working day (Mon–Fri minus holidays) within
 *    [open, close) Lagos time — closing is EXCLUSIVE (17:00 is rejected)
 *  - an order placed after closing, on a weekend or on a holiday starts work
 *    at the NEXT opening (snapToBusinessOpening) — the express tier is
 *    computed from that instant
 *  - days between two dates count only working days (weekends + holidays
 *    skipped)
 *
 * The fetch is best-effort: on any failure (network, not deployed yet, bad
 * JSON) the DEFAULT_BUSINESS_CALENDAR is used so checkout never breaks.
 */

export interface BusinessCalendar {
  /** Minute-of-day the shop opens (480 = 08:00). */
  openMinute: number;
  /** Minute-of-day the shop closes — exclusive (1020 = 17:00 rejected). */
  closeMinute: number;
  /** Date.getDay() values that are working days (Mon–Fri). */
  workingDays: readonly number[];
  /** Observed public holidays, 'YYYY-MM-DD' Lagos calendar dates. */
  holidays: ReadonlySet<string>;
}

/** Shop's real default schedule: 08:00–17:00 Mon–Fri, no holidays. */
export const DEFAULT_BUSINESS_CALENDAR: BusinessCalendar = {
  openMinute: 8 * 60,
  closeMinute: 17 * 60,
  workingDays: [1, 2, 3, 4, 5],
  holidays: new Set<string>(),
};

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://skyalxpaberin-admin.vercel.app';

/** 480 → '08:00' */
export function fmtClock(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60) % 24;
  const m = Math.round(minuteOfDay % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 'HH:MM' → minute-of-day; garbage → fallback. */
export function parseClockTime(raw: string | null | undefined, fallback: number): number {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return fallback;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return fallback;
  return h * 60 + mi;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidCalendarDate(key: string): boolean {
  const m = DATE_RE.exec(key);
  if (!m || m[1].length !== 4) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Parse the stored observed_holidays JSON into a Set (defensive). */
export function parseHolidays(raw: string | null | undefined): Set<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === 'string' && raw.trim() ? raw : '[]');
  } catch {
    return new Set();
  }
  if (!Array.isArray(parsed)) return new Set();
  const out = new Set<string>();
  for (const item of parsed) {
    const date = typeof item === 'string' ? item : item && typeof item === 'object' ? (item as Record<string, unknown>).date : null;
    if (typeof date === 'string' && isValidCalendarDate(date)) out.add(date);
  }
  return out;
}

/**
 * Build a BusinessCalendar from the public settings payload. Everything
 * unparseable falls back to the defaults — never throw.
 * `raw` is the full `data` object of GET /api/settings (the keys are flat).
 */
export function parseBusinessCalendar(raw: Record<string, string> | null | undefined): BusinessCalendar {
  const open = parseClockTime(raw?.working_day_open, DEFAULT_BUSINESS_CALENDAR.openMinute);
  const close = parseClockTime(raw?.working_day_close, DEFAULT_BUSINESS_CALENDAR.closeMinute);
  const valid = open < close;
  return {
    openMinute: valid ? open : DEFAULT_BUSINESS_CALENDAR.openMinute,
    closeMinute: valid ? close : DEFAULT_BUSINESS_CALENDAR.closeMinute,
    workingDays: DEFAULT_BUSINESS_CALENDAR.workingDays,
    holidays: parseHolidays(raw?.observed_holidays),
  };
}

let cached: BusinessCalendar | null = null;
let inflight: Promise<BusinessCalendar> | null = null;

/**
 * Best-effort fetch of the configured business calendar (module-cached for
 * the process lifetime). Any failure → defaults.
 */
export function getBusinessCalendar(): Promise<BusinessCalendar> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/settings?brand=SKYAL`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`settings ${res.status}`);
      const json = (await res.json()) as { data?: Record<string, string> };
      cached = parseBusinessCalendar(json.data ?? undefined);
    } catch {
      cached = DEFAULT_BUSINESS_CALENDAR;
    } finally {
      inflight = null;
    }
    return cached;
  })();
  return inflight;
}

/* ─────────────────── Pure calendar helpers (mirror backend) ─────────────────── */

/** Africa/Lagos is UTC+1 year-round (WAT, no DST). */
export const LAGOS_OFFSET_MINUTES = 60;

/** Shift a timestamp so `getUTC*` reads Lagos wall-clock components. */
export function lagosWall(ms: number): Date {
  return new Date(ms + LAGOS_OFFSET_MINUTES * 60000);
}

/** 'YYYY-MM-DD' Lagos calendar date of an instant. */
export function lagosDateKey(ms: number): string {
  const w = lagosWall(ms);
  return `${w.getUTCFullYear()}-${String(w.getUTCMonth() + 1).padStart(2, '0')}-${String(w.getUTCDate()).padStart(2, '0')}`;
}

/** Minute-of-day (0-1439) of an instant in Lagos wall time. */
export function lagosMinutesOfDay(ms: number): number {
  const w = lagosWall(ms);
  return w.getUTCHours() * 60 + w.getUTCMinutes();
}

export function isWorkingDayCal(ms: number, cal: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR): boolean {
  const w = lagosWall(ms);
  return cal.workingDays.includes(w.getUTCDay()) && !cal.holidays.has(lagosDateKey(ms));
}

/** Real instant for a Lagos wall-clock date+time (Lagos = UTC+1, no DST). */
export function lagosWallToMs(y: number, mo: number, d: number, minuteOfDay: number): number {
  return Date.UTC(y, mo - 1, d, Math.floor(minuteOfDay / 60) - 1, minuteOfDay % 60);
}

/**
 * Mirror of the backend `snapToBusinessOpening` — the moment work can
 * actually start:
 *  - before opening on a working day → today's opening
 *  - during [open, close) on a working day → now
 *  - after closing / weekend / holiday → next working day at opening
 */
export function snapToBusinessOpening(nowMs: number, cal: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR): number {
  const w = lagosWall(nowMs);
  const minutes = w.getUTCHours() * 60 + w.getUTCMinutes();
  const open = cal.openMinute;
  const close = cal.closeMinute;
  const onWorkingDay = cal.workingDays.includes(w.getUTCDay()) && !cal.holidays.has(lagosDateKey(nowMs));
  if (onWorkingDay && minutes < open) {
    return lagosWallToMs(w.getUTCFullYear(), w.getUTCMonth() + 1, w.getUTCDate(), open);
  }
  if (onWorkingDay && minutes >= open && minutes < close) return nowMs;
  // Closed → next working day at opening (guard: never loop forever).
  let day = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate());
  for (let guard = 0; guard < 800; guard++) {
    day += 86400000;
    const dw = new Date(day);
    if (cal.workingDays.includes(dw.getUTCDay()) && !cal.holidays.has(`${dw.getUTCFullYear()}-${String(dw.getUTCMonth() + 1).padStart(2, '0')}-${String(dw.getUTCDate()).padStart(2, '0')}`)) {
      return lagosWallToMs(dw.getUTCFullYear(), dw.getUTCMonth() + 1, dw.getUTCDate(), open);
    }
  }
  return nowMs + 800 * 86400000;
}
