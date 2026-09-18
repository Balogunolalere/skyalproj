/**
 * Order-form contract helpers (Skyal) — mirror the admin backend rules.
 *
 * Everything here is a PURE function so the rules the server enforces can be
 * unit-tested and shared between the order form, the calculator, and the chat
 * route without rendering any UI:
 *
 *  - Nigerian phone validation (backend `isValidPhone`)
 *  - `requestedPickupTime` rules: future date, working day (Mon–Fri minus
 *    observed public holidays), within the configured opening hours (default
 *    08:00–17:00) Africa/Lagos, at most 30 days ahead
 *  - the 4-tier express ladder the engine prices server-side
 *    (SAME_DAY_URGENT +100%, SAME_DAY +50%, RUSH +25%, STANDARD 0%) — computed
 *    against the SNAPPED production start (orders after close / weekend /
 *    holiday start at the next opening)
 *  - `selectedOptions` / `selectedVariant` payload shape
 *  - quote + order payload builders
 *
 * The business calendar (configurable on the admin Settings page) is loaded
 * via `getBusinessCalendar()`; all rules take an optional `calendar` argument
 * and default to the shop's real schedule (08:00–17:00 Mon–Fri, no holidays).
 */

import {
  type BusinessCalendar,
  DEFAULT_BUSINESS_CALENDAR,
  isWorkingDayCal,
  snapToBusinessOpening,
} from '@/lib/business-calendar';

/* ───────────────────────────── Option fields ───────────────────────────── */

/**
 * A single dropdown choice as returned by GET /api/services. Entries are
 * EITHER plain strings ("Gold") OR objects `{ value, image? }` where `image`
 * is an optional URL showing what the choice looks like.
 */
export interface OptionChoice {
  value: string;
  image?: string;
}

/** Structured option field as returned by GET /api/services (Django-style). */
export interface OptionField {
  key: string;
  label: string;
  type: 'dropdown' | 'text' | 'textarea' | 'number';
  choices?: (string | OptionChoice)[];
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
}

/** Normalize mixed string/object choices to `{ value, image? }`. */
export function normalizeChoices(
  choices: (string | OptionChoice)[] | null | undefined,
): OptionChoice[] {
  if (!Array.isArray(choices)) return [];
  return choices
    .filter((c): c is string | OptionChoice => typeof c === 'string' || (!!c && typeof c === 'object'))
    .map((c) =>
      typeof c === 'string'
        ? { value: c }
        : {
            value: String(c.value ?? ''),
            ...(c.image ? { image: c.image } : {}),
          },
    );
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

/** Per-field option problems, keyed by field key (the message shown under the input). */
export interface OptionValuesValidation {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Client-side copy of the backend's option contract (`validateOptionSelection`):
 * required, number bounds, text length, and "is this still a listed choice".
 *
 * `missingRequiredOptionFields` answers only the required half — everything else
 * here would otherwise reach the server and come back as a 400
 * INVALID_ORDER_INPUT *after* the customer pressed the order button, which is
 * exactly the wrong moment to tell them a number was out of range.
 */
export function validateOptionValues(
  fields: OptionField[] | null | undefined,
  values: Record<string, string>,
): OptionValuesValidation {
  const errors: Record<string, string> = {};
  for (const field of fields ?? []) {
    const text = (values[field.key] ?? "").trim();
    if (!text) {
      if (field.required) errors[field.key] = `${field.label} is required`;
      continue;
    }
    if (field.type === "number") {
      const n = Number(text);
      // The backend demands a WHOLE number (`Number.isInteger`), not merely a
      // finite one — "2.5" is rejected there, so it must not pass here.
      if (!Number.isInteger(n)) errors[field.key] = `${field.label} must be a whole number`;
      else if (typeof field.min === "number" && n < field.min)
        errors[field.key] = `${field.label} must be at least ${field.min}`;
      else if (typeof field.max === "number" && n > field.max)
        errors[field.key] = `${field.label} must be at most ${field.max}`;
      continue;
    }
    if (typeof field.maxLength === "number" && text.length > field.maxLength) {
      errors[field.key] = `${field.label} must be at most ${field.maxLength} characters`;
      continue;
    }
    if (field.type === "dropdown") {
      // No choices configured means NOTHING can be valid: the backend looks the
      // value up in the list (`choices?.find` → undefined → invalid choice).
      const choices = normalizeChoices(field.choices);
      if (!choices.some((c) => c.value === text)) {
        errors[field.key] = `${field.label} must be one of the listed options`;
      }
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * One line naming what is wrong, for a banner: the first two problems, so a
 * customer with three empty fields is not read a paragraph.
 */
export function summarizeOptionErrors(errors: Record<string, string>): string | null {
  const messages = Object.values(errors).filter(Boolean);
  if (messages.length === 0) return null;
  const head = messages.slice(0, 2).join("; ");
  return messages.length > 2 ? `${head}; +${messages.length - 2} more` : head;
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

function holidayKey(wall: Date): string {
  return `${wall.getUTCFullYear()}-${String(wall.getUTCMonth() + 1).padStart(2, '0')}-${String(wall.getUTCDate()).padStart(2, '0')}`;
}

function isWorkingDay(wall: Date, cal: BusinessCalendar): boolean {
  return cal.workingDays.includes(wall.getUTCDay()) && !cal.holidays.has(holidayKey(wall));
}

/**
 * Server-enforced `requestedPickupTime` contract:
 *  - future instant
 *  - working day in Africa/Lagos (Mon–Fri minus observed public holidays)
 *  - within [open, close) Lagos wall-clock — CLOSING IS EXCLUSIVE (17:00
 *    with the default calendar is rejected)
 *  - at most `MAX_PICKUP_DAYS` ahead
 */
export function isValidPickupISO(
  iso: string,
  nowMs: number = Date.now(),
  cal: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR,
): boolean {
  if (typeof iso !== 'string' || iso.length === 0) return false;
  if (!Number.isFinite(nowMs)) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;

  const wall = lagosWall(t);
  if (!isWorkingDay(wall, cal)) return false;
  const minutes = wall.getUTCHours() * 60 + wall.getUTCMinutes();
  if (minutes < cal.openMinute || minutes >= cal.closeMinute) return false;

  if (t <= nowMs) return false;
  if (t > nowMs + MAX_PICKUP_DAYS * 86400000) return false;
  return true;
}

/**
 * Compose an ISO string from a `YYYY-MM-DD` date and `HH:mm` time treated as
 * Africa/Lagos wall-clock. Returns `null` when the result violates the
 * backend rules (weekend/holiday, outside working hours, not future, >30 days).
 */
export function pickupISOFromParts(
  dateStr: string,
  timeStr: string,
  nowMs: number = Date.now(),
  cal: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR,
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
  return isValidPickupISO(iso, nowMs, cal) ? iso : null;
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
 * Calendar bounds for the pickup picker: today (Lagos) — or the next working
 * day once the studio has closed (or on a weekend/holiday) — rolled forward
 * past weekends and observed holidays, up to `MAX_PICKUP_DAYS` ahead. Returns
 * browser-local midnights so the calendar renders the same dates in any
 * timezone; `isValidPickupISO` remains the authoritative check.
 */
export function pickupDateBounds(
  nowMs: number = Date.now(),
  cal: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR,
): PickupDateBounds {
  const wall = lagosWall(nowMs);
  const minutes = wall.getUTCHours() * 60 + wall.getUTCMinutes();
  let min = new Date(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());

  if (minutes >= cal.closeMinute) {
    min = new Date(min.getTime() + 86400000);
  }
  while (!isWorkingDay(lagosWall(min.getTime()), cal)) {
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
    // First :00/:30 slot strictly after now, clamped into [open, close).
    let minute = Math.ceil((wall.getUTCMinutes() + 1) / 30) * 30;
    let hour = wall.getUTCHours();
    if (minute >= 60) {
      hour += 1;
      minute = 0;
    }
    const first = hour * 60 + minute;
    const slot = first < cal.openMinute
      ? Math.ceil(cal.openMinute / 30) * 30 // the first 30-min slot at/after opening
      : first;
    if (slot < cal.closeMinute) {
      bounds.minTime = `${String(Math.floor(slot / 60)).padStart(2, '0')}:${String(slot % 60).padStart(2, '0')}`;
    }
  }

  return bounds;
}

function defaultPickupDayMinutes(cal: BusinessCalendar): number {
  // One hour before closing — valid for the default (16:00 with 08:00–17:00)
  // AND for customized hours (never lands exactly on the exclusive close).
  return Math.max(cal.openMinute, cal.closeMinute - 60);
}

/**
 * Sane default pickup: now + 2 working days (skipping weekends AND observed
 * holidays) at one hour before closing Africa/Lagos (16:00 by default).
 * Used by the chat route when the customer's spec has no pickup time.
 */
export function defaultPickupISO(
  nowMs: number = Date.now(),
  cal: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR,
): string {
  const startWall = lagosWall(nowMs);
  let cursor = new Date(
    Date.UTC(startWall.getUTCFullYear(), startWall.getUTCMonth(), startWall.getUTCDate() + 1),
  );
  let workingDays = 0;
  while (true) {
    const wall = lagosWall(cursor.getTime());
    if (isWorkingDay(wall, cal)) {
      workingDays += 1;
      if (workingDays >= 2) break;
    }
    cursor = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1));
  }
  const wall = lagosWall(cursor.getTime());
  const minutes = defaultPickupDayMinutes(cal);
  return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), Math.floor(minutes / 60) - 1, minutes % 60)).toISOString();
}

/** YYYYMMDD key of a Lagos wall-clock date (for day comparisons). */
function lagosDayKey(wall: Date): number {
  return wall.getUTCFullYear() * 10000 + (wall.getUTCMonth() + 1) * 100 + wall.getUTCDate();
}

/** Working days strictly after `fromWall`'s date up to and including `toWall`'s
 *  (weekends AND observed holidays skipped). */
function workingDaysAhead(fromWall: Date, toWall: Date, cal: BusinessCalendar): number {
  const toKey = lagosDayKey(toWall);
  let count = 0;
  let cursor = new Date(
    Date.UTC(fromWall.getUTCFullYear(), fromWall.getUTCMonth(), fromWall.getUTCDate() + 1),
  );
  while (true) {
    const wall = lagosWall(cursor.getTime());
    if (lagosDayKey(wall) > toKey) break;
    if (isWorkingDay(wall, cal)) count += 1;
    cursor = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1));
  }
  return count;
}

/**
 * Client mirror of the engine's tiered express ladder, driven ONLY by the
 * pickup time (the legacy flat `expressSurchargePct` is no longer the rule):
 *   SAME_DAY_URGENT  <4h from the effective start      +100%
 *   SAME_DAY         ≥4h, same Lagos working day       +50%
 *   RUSH             <2 working days (holiday-aware)   +25%
 *   STANDARD         otherwise                           0%
 *
 * Like the engine, "now" is snapped to the business calendar first: an order
 * placed after closing, on a weekend or on an observed holiday starts at the
 * next opening (e.g. Fri 18:30 → Mon 08:00), so a Monday 09:00 pickup is
 * URGENT (+100%), not RUSH. Returns the surcharge ratio (1.0 = +100%).
 */
export function pickupTierPct(
  pickupISO: string,
  nowMs: number = Date.now(),
  cal: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR,
): number {
  const t = Date.parse(pickupISO);
  if (!Number.isFinite(t)) return 0;

  const effectiveNow = snapToBusinessOpening(nowMs, cal);
  const hoursAhead = (t - effectiveNow) / 3600000;
  if (hoursAhead < 4) return 1.0;

  const pickupWall = lagosWall(t);
  const nowWall = lagosWall(effectiveNow);
  const sameDay =
    pickupWall.getUTCFullYear() === nowWall.getUTCFullYear() &&
    pickupWall.getUTCMonth() === nowWall.getUTCMonth() &&
    pickupWall.getUTCDate() === nowWall.getUTCDate();
  if (sameDay) return 0.5;

  if (workingDaysAhead(nowWall, pickupWall, cal) < 2) return 0.25;
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
  // Digits only: the client accepts separators (including a leading paren, which
  // the backend's regex rejects), so send the normalised form.
  if (args.customerPhone) payload.customerPhone = stripPhoneFormatting(args.customerPhone);
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
    // Digits only — see buildQuotePayload.
    customerPhone: stripPhoneFormatting(args.customerPhone),
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
