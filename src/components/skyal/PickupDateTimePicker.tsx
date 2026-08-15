"use client";

import { useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import {
  isValidPickupISO,
  lagosWall,
  pickupDateBounds,
  pickupISOFromParts,
  formatPickupISO,
} from "@/lib/order";

/** 09:00–18:00 in 30-minute slots (18:30 excluded). */
const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 9; h <= 18; h++) {
    for (const m of [0, 30]) {
      if (h === 18 && m === 30) continue;
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
})();

/** `YYYY-MM-DD` of a browser-local Date (used to feed `pickupISOFromParts`). */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Pickup date + time picker mirroring the backend `requestedPickupTime`
 * contract: weekends disabled, 09:00–18:00 Africa/Lagos only, at most 30 days
 * ahead. Emits an ISO string ("" when nothing valid is selected).
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

  // Bounds are computed from the Lagos wall clock; as browser-local midnights
  // they render as the same calendar dates regardless of the machine TZ.
  const bounds = useMemo(() => pickupDateBounds(), []);

  const selected = useMemo(() => {
    if (!value || !isValidPickupISO(value)) return { date: undefined as Date | undefined, time: "" };
    const wall = lagosWall(Date.parse(value));
    return {
      date: new Date(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()),
      time: `${String(wall.getUTCHours()).padStart(2, "0")}:${String(wall.getUTCMinutes()).padStart(2, "0")}`,
    };
  }, [value]);

  const isToday = (d: Date | undefined): boolean =>
    !!d && localDateKey(d) === localDateKey(bounds.minDate);

  const commit = (date: Date | undefined, time: string) => {
    setTouched(true);
    if (!date) {
      onChange("");
      return;
    }
    const iso = pickupISOFromParts(localDateKey(date), time);
    if (iso) {
      onChange(iso);
      return;
    }
    // The previous time may be unusable for this date (e.g. today and already
    // past) — fall back to the first valid slot for that date.
    const fallbackTime = isToday(date) ? bounds.minTime ?? "09:00" : "09:00";
    onChange(pickupISOFromParts(localDateKey(date), fallbackTime) ?? "");
  };

  const valid = !!value && isValidPickupISO(value);

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
              onSelect={(d) => commit(d ?? undefined, selected.time || "09:00")}
              defaultMonth={selected.date ?? bounds.minDate}
              fromDate={bounds.minDate}
              toDate={bounds.maxDate}
              disabled={{ dayOfWeek: [0, 6] }}
              numberOfMonths={1}
            />
          </div>
          <p className="text-xs text-thread mt-2 leading-relaxed">
            Mon–Fri only · within 30 days.
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
            {TIME_SLOTS.map((slot) => {
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
            Studio hours are 09:00–18:00 WAT.
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
          Pick a future weekday (Mon–Fri) between 09:00 and 18:00 Lagos time —
          no more than 30 days ahead.
        </p>
      )}
    </div>
  );
}
