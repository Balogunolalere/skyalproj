/**
 * Order-form contract helpers (Skyal) — mirror the admin backend rules.
 *
 * Everything here is a PURE function so the rules the server enforces can be
 * unit-tested and shared between the order form, the calculator, and the chat
 * route without rendering any UI:
 *
 *  - Nigerian phone validation (backend `isValidPhone`)
 *  - `requestedPickupTime` rules: future date, Mon–Fri, 09:00–18:00
 *    Africa/Lagos, at most 30 days ahead
 *  - the 4-tier express ladder the engine prices server-side
 *    (SAME_DAY_URGENT +100%, SAME_DAY +50%, RUSH +25%, STANDARD 0%)
 *  - `selectedOptions` / `selectedVariant` payload shape
 *  - quote + order payload builders
 */

/* ───────────────────────────── Option fields ───────────────────────────── */

/** Structured option field as returned by GET /api/services (Django-style). */
export interface OptionField {
  key: string;
  label: string;
  type: 'dropdown' | 'text' | 'textarea' | 'number';
  choices?: string[];
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
}

/** Option-related shape every service payload carries. */
export interface ServiceOptionShape {
  options?: string[];
  optionFields?: OptionField[] | null;
}

/**
 * Required option fields that have no (non-blank) value yet.
 * Used to gate the order form's next step and the calculator's submit.
 */
export function missingRequiredOptionFields(
  fields: OptionField[] | null | undefined,
  values: Record<string, string>,
): string[] {
  if (!fields) return [];
  return fields
    .filter((f) => f.required && !(values[f.key] ?? '').trim())
    .map((f) => f.label);
}

/* ───────────────────────────── Phone validation ───────────────────────────── */

/** Strip spaces, dashes and parens before matching (backend accepts them). */
export function stripPhoneFormatting(phone: string): string {
  return phone.replace(/[\s\-()]/g, '');
}

/**
 * Backend `isValidPhone`: 11 digits `0[789][01]XXXXXXXX` or 13 digits
 * `234[789][01]XXXXXXXX` (with or without a leading `+`).
 */
export const NIGERIAN_PHONE_REGEX = /^(\+?234|0)[789][01]\d{8}$/;

export function isValidNigerianPhone(phone: string): boolean {
  return NIGERIAN_PHONE_REGEX.test(stripPhoneFormatting(phone.trim()));
}

/* ───────────────────────────── Pickup time rules ───────────────────────────── */

/** Africa/Lagos is UTC+1 year-round (WAT, no DST). */
const LAGOS_OFFSET_MINUTES = 60;

/** Max lead time the backend accepts. */
export const MAX_PICKUP_DAYS = 30;

/**
 * Shift a timestamp by the Lagos offset so `getUTC*` reads Lagos wall-clock
 * components — independent of the machine's local timezone.
 */
export function lagosWall(ms: number): Date {
  return new Date(ms + LAGOS_OFFSET_MINUTES * 60000);
}

function isWeekday(wall: Date): boolean {
  const dow = wall.getUTCDay();
  return dow >= 1 && dow <= 5; // Mon–Fri
}

/**
 * Server-enforced `requestedPickupTime` contract:
 *  - future instant
 *  - Mon–Fri in Africa/Lagos
 *  - 09:00–18:00 Lagos wall-clock (18:00 included, later minutes not)
 *  - at most `MAX_PICKUP_DAYS` ahead
 */
export function isValidPickupISO(iso: string, nowMs: number = Date.now()): boolean {
  if (typeof iso !== 'string' || iso.length === 0) return false;
  if (!Number.isFinite(nowMs)) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;

  const wall = lagosWall(t);
  if (!isWeekday(wall)) return false;
  const hour = wall.getUTCHours();
  const minute = wall.getUTCMinutes();
  if (hour < 9 || hour > 18) return false;
  if (hour === 18 && minute !== 0) return false;

  if (t <= nowMs) return false;
  if (t > nowMs + MAX_PICKUP_DAYS * 86400000) return false;
  return true;
}

/**
 * Compose an ISO string from a `YYYY-MM-DD` date and `HH:mm` time treated as
 * Africa/Lagos wall-clock. Returns `null` when the result violates the
 * backend rules (weekend, outside 09:00–18:00, not future, >30 days).
 */
export function pickupISOFromParts(
  dateStr: string,
  timeStr: string,
  nowMs: number = Date.now(),
): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  // Lagos wall-clock → UTC instant (Lagos = UTC+1).
  const iso = new Date(Date.UTC(year, month, day, hour - 1, minute)).toISOString();
  return isValidPickupISO(iso, nowMs) ? iso : null;
}

export interface PickupDateBounds {
  /** Browser-local midnight of the earliest selectable Lagos date. */
  minDate: Date;
  /** Browser-local midnight of the latest selectable Lagos date. */
  maxDate: Date;
  /** When the earliest date is today (Lagos), the first usable time slot. */
  minTime?: string;
}

/**
 * Calendar bounds for the pickup picker: today (Lagos) — or tomorrow once the
 * studio has closed at 18:00 — rolled forward past weekends, up to
 * `MAX_PICKUP_DAYS` ahead. Returns browser-local midnights so the calendar
 * renders the same dates in any timezone; `isValidPickupISO` remains the
 * authoritative check.
 */
export function pickupDateBounds(nowMs: number = Date.now()): PickupDateBounds {
  const wall = lagosWall(nowMs);
  let min = new Date(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());

  if (wall.getUTCHours() >= 18) {
    min = new Date(min.getTime() + 86400000);
  }
  while (!isWeekday(lagosWall(min.getTime()))) {
    min = new Date(min.getTime() + 86400000);
  }

  const maxWall = lagosWall(nowMs + MAX_PICKUP_DAYS * 86400000);
  const max = new Date(maxWall.getUTCFullYear(), maxWall.getUTCMonth(), maxWall.getUTCDate());

  const bounds: PickupDateBounds = { minDate: min, maxDate: max };

  const isToday =
    wall.getUTCFullYear() === min.getFullYear() &&
    wall.getUTCMonth() === min.getMonth() &&
    wall.getUTCDate() === min.getDate();
  if (isToday) {
    // First :00/:30 slot strictly after now.
    let hour = wall.getUTCHours();
    let minute = (Math.floor(wall.getUTCMinutes() / 30) + 1) * 30;
    if (minute >= 60) {
      hour += 1;
      minute = 0;
    }
    if (hour < 9) {
      hour = 9;
      minute = 0;
    }
    if (hour <= 18 && minute < 60) {
      bounds.minTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  return bounds;
}

/**
 * Sane default pickup: now + 2 working days at 17:00 Africa/Lagos.
 * Used by the chat route when the customer's spec has no pickup time.
 */
export function defaultPickupISO(nowMs: number = Date.now()): string {
  const startWall = lagosWall(nowMs);
  let cursor = new Date(
    Date.UTC(startWall.getUTCFullYear(), startWall.getUTCMonth(), startWall.getUTCDate() + 1),
  );
  let workingDays = 0;
  while (true) {
    const wall = lagosWall(cursor.getTime());
    if (isWeekday(wall)) {
      workingDays += 1;
      if (workingDays >= 2) break;
    }
    cursor = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1));
  }
  const wall = lagosWall(cursor.getTime());
  return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), 17 - 1, 0)).toISOString();
}

/** YYYYMMDD key of a Lagos wall-clock date (for day comparisons). */
function lagosDayKey(wall: Date): number {
  return wall.getUTCFullYear() * 10000 + (wall.getUTCMonth() + 1) * 100 + wall.getUTCDate();
}

/** Weekdays strictly after `fromWall`'s date up to and including `toWall`'s. */
function workingDaysAhead(fromWall: Date, toWall: Date): number {
  const toKey = lagosDayKey(toWall);
  let count = 0;
  let cursor = new Date(
    Date.UTC(fromWall.getUTCFullYear(), fromWall.getUTCMonth(), fromWall.getUTCDate() + 1),
  );
  while (true) {
    const wall = lagosWall(cursor.getTime());
    if (lagosDayKey(wall) > toKey) break;
    if (isWeekday(wall)) count += 1;
    cursor = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1));
  }
  return count;
}

/**
 * Client mirror of the engine's tiered express ladder, driven ONLY by the
 * pickup time (the legacy flat `expressSurchargePct` is no longer the rule):
 *   SAME_DAY_URGENT  <4h ahead            +100%
 *   SAME_DAY         ≥4h, same Lagos day  +50%
 *   RUSH             <2 working days      +25%
 *   STANDARD         otherwise            0%
 * Returns the surcharge ratio (1.0 = +100%).
 */
export function pickupTierPct(pickupISO: string, nowMs: number = Date.now()): number {
  const t = Date.parse(pickupISO);
  if (!Number.isFinite(t)) return 0;

  const hoursAhead = (t - nowMs) / 3600000;
  if (hoursAhead < 4) return 1.0;

  const pickupWall = lagosWall(t);
  const nowWall = lagosWall(nowMs);
  const sameDay =
    pickupWall.getUTCFullYear() === nowWall.getUTCFullYear() &&
    pickupWall.getUTCMonth() === nowWall.getUTCMonth() &&
    pickupWall.getUTCDate() === nowWall.getUTCDate();
  if (sameDay) return 0.5;

  if (workingDaysAhead(nowWall, pickupWall) < 2) return 0.25;
  return 0;
}

/** Human-readable Lagos display, e.g. "Mon 17 Aug 2026 · 16:00 WAT". */
export function formatPickupISO(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const wall = lagosWall(t);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hh = String(wall.getUTCHours()).padStart(2, '0');
  const mm = String(wall.getUTCMinutes()).padStart(2, '0');
  return `${days[wall.getUTCDay()]} ${wall.getUTCDate()} ${months[wall.getUTCMonth()]} ${wall.getUTCFullYear()} · ${hh}:${mm} WAT`;
}

/* ───────────────────────────── Payload builders ───────────────────────────── */

export interface QuotePayloadArgs {
  serviceType: string;
  quantity: number;
  sla: string;
  /** ISO string — the engine rejects requests without it. */
  requestedPickupTime: string;
  deliveryMethod?: string;
  deliveryAddress?: string;
  referralCode?: string;
  customerPhone?: string;
  selectedVariant?: string;
  selectedOptions?: Record<string, string>;
}

/**
 * Build the POST /api/services/quote body. Structured `selectedOptions` wins
 * over the legacy `selectedVariant` — never both (server treats them as
 * mutually exclusive).
 */
export function buildQuotePayload(args: QuotePayloadArgs): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    brand: 'SKYAL',
    serviceType: args.serviceType,
    quantity: args.quantity,
    sla: args.sla,
    requestedPickupTime: args.requestedPickupTime,
  };
  if (args.deliveryMethod) payload.deliveryMethod = args.deliveryMethod;
  if (args.deliveryAddress) payload.deliveryAddress = args.deliveryAddress;
  if (args.referralCode) payload.referralCode = args.referralCode;
  if (args.customerPhone) payload.customerPhone = args.customerPhone;
  if (args.selectedOptions && Object.keys(args.selectedOptions).length > 0) {
    payload.selectedOptions = args.selectedOptions;
  } else if (args.selectedVariant) {
    payload.selectedVariant = args.selectedVariant;
  }
  return payload;
}

export interface OrderPayloadArgs {
  quantity: number;
  sla: string;
  customerName: string;
  customerPhone: string;
  /** Always sent (backend requires the key) — empty string when absent. */
  customerEmail: string;
  requestedPickupTime: string;
  deliveryMethod?: string;
  deliveryAddress?: string;
  referralCode?: string;
  designFileUrl?: string;
  designFilePublicId?: string;
  customerNotes?: string;
  /** Catalog path. */
  serviceType?: string;
  selectedVariant?: string;
  selectedOptions?: Record<string, string>;
  /** Custom-job path (admin runs the rule lookup). */
  customSpec?: Record<string, unknown>;
}

/** Build the POST /api/orders body — shared shape for catalog AND custom jobs. */
export function buildOrderPayload(args: OrderPayloadArgs): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    brand: 'SKYAL',
    quantity: args.quantity,
    sla: args.sla,
    customerName: args.customerName,
    customerPhone: args.customerPhone,
    customerEmail: args.customerEmail,
    requestedPickupTime: args.requestedPickupTime,
  };
  if (args.deliveryMethod) payload.deliveryMethod = args.deliveryMethod;
  if (args.deliveryAddress) payload.deliveryAddress = args.deliveryAddress;
  if (args.referralCode) payload.referralCode = args.referralCode;
  if (args.designFileUrl) {
    payload.designFileUrl = args.designFileUrl;
    if (args.designFilePublicId) payload.designFilePublicId = args.designFilePublicId;
  }
  if (args.customerNotes) payload.customerNotes = args.customerNotes;
  if (args.serviceType) {
    payload.serviceType = args.serviceType;
    if (args.selectedOptions && Object.keys(args.selectedOptions).length > 0) {
      payload.selectedOptions = args.selectedOptions;
    } else if (args.selectedVariant) {
      payload.selectedVariant = args.selectedVariant;
    }
  }
  if (args.customSpec) payload.customSpec = args.customSpec;
  return payload;
}
