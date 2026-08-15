"use client";

import type { OptionField, ServiceOptionShape } from "@/lib/order";

/**
 * Renders the service's option inputs exactly like the admin contract:
 *  - `optionFields` → one input per field by type (dropdown → select of
 *    choices, text → input, textarea → textarea, number → number with
 *    min/max) with values kept as strings in `selectedOptions`.
 *  - legacy `options: string[]` → the single dropdown, stored in `variant`.
 *
 * Kept free of hooks so it can be server-rendered in unit tests.
 */
export function OptionFieldsBlock({
  service,
  values,
  onChange,
  variant,
  onVariantChange,
}: {
  service: ServiceOptionShape;
  /** Structured field values (key → string). */
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  /** Legacy flat-option selection. */
  variant: string;
  onVariantChange: (variant: string) => void;
}) {
  const fields = Array.isArray(service.optionFields) ? service.optionFields : [];
  if (fields.length > 0) {
    return (
      <div className="space-y-5">
        {fields.map((field) => (
          <OptionFieldInput
            key={field.key}
            field={field}
            value={values[field.key] ?? ""}
            onChange={(v) => onChange({ ...values, [field.key]: v })}
          />
        ))}
      </div>
    );
  }

  const legacy = Array.isArray(service.options) ? service.options.filter(Boolean) : [];
  if (legacy.length > 0) {
    return (
      <div>
        <select
          aria-label="Variant"
          value={variant}
          onChange={(e) => onVariantChange(e.target.value)}
          className="mt-2 w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none"
        >
          <option value="">Select an option…</option>
          {legacy.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return null;
}

const inputClass =
  "mt-2 w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none";

function OptionFieldInput({
  field,
  value,
  onChange,
}: {
  field: OptionField;
  value: string;
  onChange: (v: string) => void;
}) {
  const requiredMark = field.required ? (
    <span className="text-laser" title="Required">
      {" "}*
    </span>
  ) : null;
  const label = (
    <label
      htmlFor={`option-${field.key}`}
      className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread"
    >
      {field.label}
      {requiredMark}
      {!field.required && <span className="lowercase"> (optional)</span>}
    </label>
  );

  switch (field.type) {
    case "dropdown":
      return (
        <div>
          {label}
          <select
            id={`option-${field.key}`}
            value={value}
            required={field.required}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          >
            <option value="">{field.required ? "Select…" : "None"}</option>
            {(field.choices ?? []).map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        </div>
      );
    case "textarea":
      return (
        <div>
          {label}
          <textarea
            id={`option-${field.key}`}
            value={value}
            required={field.required}
            maxLength={field.maxLength}
            rows={3}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass} resize-none`}
          />
        </div>
      );
    case "number":
      return (
        <div>
          {label}
          <input
            id={`option-${field.key}`}
            type="number"
            value={value}
            required={field.required}
            min={field.min}
            max={field.max}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
        </div>
      );
    case "text":
    default:
      return (
        <div>
          {label}
          <input
            id={`option-${field.key}`}
            type="text"
            value={value}
            required={field.required}
            maxLength={field.maxLength}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
        </div>
      );
  }
}

/** A required-option error hint, e.g. "Required: Colour, Topper message". */
export function RequiredOptionsHint({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null;
  return (
    <p className="text-xs text-oxblood mt-2" role="alert">
      Required: {missing.join(", ")}
    </p>
  );
}
