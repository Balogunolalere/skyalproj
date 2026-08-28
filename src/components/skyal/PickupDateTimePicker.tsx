"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import {
  isValidPickupISO,
  lagosWall,
  pickupDateBounds,
  pickupISOFromParts,
  formatPickupISO,
} from "@/lib/order";
import {
  type BusinessCalendar,
  DEFAULT_BUSINESS_CALENDAR,
  fmtClock,
  getBusinessCalendar,
} from "@/lib/business-calendar";

/** 30-minute slots within [open, close) — closing is EXCLUSIVE (17:00 excluded). */
function timeSlots(cal: BusinessCalendar): string[] {
  const slots: string[] = [];
  for (let m = Math.ceil(cal.openMinute / 30) * 30; m < cal.closeMinute; m += 30) {
    slots.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return slots;
}

/** `YYYY-MM-DD` of a browser-local Date (used to feed `pickupISOFromParts`). */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Pickup date + time picker mirroring the backend `requestedPickupTime`
 * contract: weekends AND observed public holidays disabled, configured working
 * hours (default 08:00–17:00) Africa/Lagos only, at most 30 days ahead.
 * Emits an ISO string ("" when nothing valid is selected).
 * The business calendar is fetched from the admin (public settings) — any
 * failure falls back to the defaults.
 */
export function PickupDateTimePicker({
  value,
  onChange,
}: {
  /** ISO string or "". */
  value: string;
  onChange: (iso: string) => void;
}) {
  const [touched, setTouched] = useState(false);
  const [cal, setCal] = useState<BusinessCalendar>(DEFAULT_BUSINESS_CALENDAR);

  useEffect(() => {
    let live = true;
    getBusinessCalendar().then((c) => {
      if (live) setCal(c);
    });
    return () => {
      live = false;
    };
  }, []);

  // Bounds are computed from the Lagos wall clock; as browser-local midnights
  // they render as the same calendar dates regardless of the machine TZ.
  const bounds = useMemo(() => pickupDateBounds(Date.now(), cal), [cal]);
  const slots = useMemo(() => timeSlots(cal), [cal]);

  const selected = useMemo(() => {
    if (!value || !isValidPickupISO(value, Date.now(), cal)) return { date: undefined as Date | undefined, time: "" };
    const wall = lagosWall(Date.parse(value));
    return {
      date: new Date(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()),
      time: `${String(wall.getUTCHours()).padStart(2, "0")}:${String(wall.getUTCMinutes()).padStart(2, "0")}`,
    };
  }, [value, cal]);

  const isToday = (d: Date | undefined): boolean =>
    !!d && localDateKey(d) === localDateKey(bounds.minDate);

  const commit = (date: Date | undefined, time: string) => {
    setTouched(true);
    if (!date) {
      onChange("");
      return;
    }
    const iso = pickupISOFromParts(localDateKey(date), time, Date.now(), cal);
    if (iso) {
      onChange(iso);
      return;
    }
    // The previous time may be unusable for this date (e.g. today and already
    // past) — fall back to the first valid slot for that date.
    const fallbackTime = isToday(date) ? bounds.minTime ?? slots[0] ?? "" : slots[0] ?? "";
    onChange(pickupISOFromParts(localDateKey(date), fallbackTime, Date.now(), cal) ?? "");
  };

  const valid = !!value && isValidPickupISO(value, Date.now(), cal);
  const hoursLabel = `${fmtClock(cal.openMinute)}–${fmtClock(cal.closeMinute)}`;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
            Pickup date <span className="text-laser">*</span>
          </label>
          <div className="mt-2 border border-hairline bg-bone p-2 inline-block">
            <Calendar
              mode="single"
              selected={selected.date}
              onSelect={(d) => commit(d ?? undefined, selected.time || slots[0] || "")}
              defaultMonth={selected.date ?? bounds.minDate}
              fromDate={bounds.minDate}
              toDate={bounds.maxDate}
              disabled={(d) => {
                // The calendar renders browser-local midnights that stand for
                // Lagos dates (same convention as `localDateKey` below).
                const key = localDateKey(d);
                return [0, 6].includes(d.getDay()) || cal.holidays.has(key);
              }}
              numberOfMonths={1}
            />
          </div>
          <p className="text-xs text-thread mt-2 leading-relaxed">
            Working days only (Mon–Fri minus observed public holidays) · within 30 days.
          </p>
        </div>

        <div>
          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
            Pickup time <span className="text-laser">*</span>
          </label>
          <select
            value={selected.time}
            onChange={(e) => commit(selected.date, e.target.value)}
            className="mt-2 w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none"
          >
            <option value="" disabled>
              Select a time…
            </option>
            {slots.map((slot) => {
              const past = !!(
                isToday(selected.date) &&
                bounds.minTime &&
                slot < bounds.minTime
              );
              return (
                <option key={slot} value={slot} disabled={past}>
                  {slot} (Lagos){past ? " — passed" : ""}
                </option>
              );
            })}
          </select>
          <p className="text-xs text-thread mt-2 leading-relaxed">
            Studio hours are {hoursLabel} WAT.
          </p>

          {valid && (
            <div className="mt-4 bg-vellum border border-laser/40 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-laser mb-1">
                Pickup booked for
              </div>
              <div className="font-display font-semibold text-lg text-ink">
                {formatPickupISO(value)}
              </div>
            </div>
          )}
        </div>
      </div>

      {touched && !valid && (
        <p className="text-sm text-oxblood" role="alert">
          Pick a future working day (Mon–Fri, not a public holiday) between {hoursLabel} Lagos time —
          no more than 30 days ahead.
        </p>
      )}
    </div>
  );
}
