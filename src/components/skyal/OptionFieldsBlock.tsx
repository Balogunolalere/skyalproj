"use client";

import { normalizeChoices, type OptionField, type ServiceOptionShape } from "@/lib/order";

/**
 * Renders the service's option inputs exactly like the admin contract:
 *  - `optionFields` → one input per field by type (dropdown → select of
 *    choices, text → input, textarea → textarea, number → number with
 *    min/max) with values kept as strings in `selectedOptions`.
 *  - dropdown choices may be strings OR `{ value, image? }` objects; when any
 *    choice carries an image, the dropdown renders as a radio-style choice
 *    grid so the thumbnails are visible. The selected value is still just the
 *    string `choice.value` — no payload changes.
 *  - legacy `options: string[]` → the single dropdown, stored in `variant`,
 *    exactly as before.
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
  const labelContent = (
    <>
      {field.label}
      {requiredMark}
      {!field.required && <span className="lowercase"> (optional)</span>}
    </>
  );
  const labelClass = "font-mono text-[10px] uppercase tracking-[0.18em] text-thread";
  const fieldLabel = (
    <label htmlFor={`option-${field.key}`} className={labelClass}>
      {labelContent}
    </label>
  );

  switch (field.type) {
    case "dropdown": {
      const choices = normalizeChoices(field.choices);
      const hasImages = choices.some((c) => !!c.image);

      // Thumbnails can't render inside a native <select>, so when any choice
      // has an image switch to a radio-style grid. The emitted value is still
      // the plain string `choice.value`.
      if (hasImages) {
        return (
          <div>
            <span className={labelClass}>{labelContent}</span>
            <div
              role="radiogroup"
              aria-label={field.label}
              className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3"
            >
              {choices.map((choice) => {
                const selected = value === choice.value;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-choice-value={choice.value}
                    onClick={() => onChange(choice.value)}
                    className={`p-2 border text-left transition-colors flex items-center gap-3 ${
                      selected
                        ? "border-laser bg-vellum"
                        : "border-hairline bg-bone hover:border-ink/40"
                    }`}
                  >
                    {choice.image ? (
                      <img
                        src={choice.image}
                        alt=""
                        loading="lazy"
                        className="h-10 w-10 shrink-0 object-cover border border-hairline"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="h-10 w-10 shrink-0 border border-hairline bg-vellum"
                      />
                    )}
                    <span className="text-sm text-ink">{choice.value}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      }

      return (
        <div>
          {fieldLabel}
          <select
            id={`option-${field.key}`}
            value={value}
            required={field.required}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          >
            <option value="">{field.required ? "Select…" : "None"}</option>
            {choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.value}
              </option>
            ))}
          </select>
        </div>
      );
    }
    case "textarea":
      return (
        <div>
          {fieldLabel}
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
          {fieldLabel}
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
          {fieldLabel}
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
