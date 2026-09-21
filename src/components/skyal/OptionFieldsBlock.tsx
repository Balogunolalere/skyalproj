"use client";

import { normalizeChoices, type OptionField, type ServiceOptionShape } from "@/lib/order";
import { PRINT_FONTS, fontStack, previewTextFor } from "@/lib/print-fonts";

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
  errors,
}: {
  service: ServiceOptionShape;
  /** Structured field values (key → string). */
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  /** Legacy flat-option selection. */
  variant: string;
  onVariantChange: (variant: string) => void;
  /** Per-field problems from `validateOptionValues`, shown under each input. */
  errors?: Record<string, string>;
}) {
  const fields = Array.isArray(service.optionFields) ? service.optionFields : [];
  if (fields.length > 0) {
    // What a font preview should render: the text the customer has typed into
    // this service's message field, or a sample until they type.
    const previewText = previewTextFor(fields, values);
    return (
      <div className="space-y-5">
        {fields.map((field) => (
          <OptionFieldInput
            key={field.key}
            field={field}
            value={values[field.key] ?? ""}
            onChange={(v) => onChange({ ...values, [field.key]: v })}
            error={errors?.[field.key]}
            previewText={previewText}
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
  error,
  previewText,
}: {
  field: OptionField;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  /** Text the font preview renders (the customer's message, or a sample). */
  previewText?: string;
}) {
  const errorLine = error ? (
    <p role="alert" className="text-xs text-oxblood mt-1.5">
      {error}
    </p>
  ) : null;
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
    case "font": {
      const choices = normalizeChoices(field.choices);
      const selected = choices.some((c) => c.value === value) ? value : "";
      const shown = previewText ?? "Happy Birthday";
      const styles = choices.length > 0 ? choices : PRINT_FONTS.map((f) => ({ value: f.name, image: undefined }));
      return (
        <div>
          <span className={labelClass}>{labelContent}</span>
          {/* Every name is rendered IN ITS OWN FONT: that is the comparison the
              customer is here to make. */}
          <div role="radiogroup" aria-label={field.label} className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {styles.map((choice) => {
              const isSelected = selected === choice.value;
              return (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  data-choice-value={choice.value}
                  onClick={() => onChange(choice.value)}
                  style={{ fontFamily: fontStack(choice.value) }}
                  className={`px-3 py-3 border text-lg leading-tight transition-colors ${
                    isSelected ? "border-laser bg-vellum text-ink" : "border-hairline bg-bone text-ink/80 hover:border-ink/40"
                  }`}
                >
                  {choice.value}
                </button>
              );
            })}
          </div>
          {selected && (
            <div className="mt-3 border border-hairline bg-vellum px-4 py-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                Your text in {selected}
              </p>
              <p
                data-testid="font-preview"
                style={{ fontFamily: fontStack(selected) }}
                className="mt-2 text-ink text-3xl sm:text-4xl leading-tight break-words"
              >
                {shown}
              </p>
              <p className="mt-2 text-xs text-thread/70">
                A guide, not a proof — your operator sets the final size and spacing.
              </p>
            </div>
          )}
          {errorLine}
        </div>
      );
    }
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
            aria-invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass}${error ? " border-oxblood" : ""}`}
          >
            <option value="">{field.required ? "Select…" : "None"}</option>
            {choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.value}
              </option>
            ))}
          </select>
          {errorLine}
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
            aria-invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass}${error ? " border-oxblood" : ""} resize-none`}
          />
          {errorLine}
          {/* This value is reproduced verbatim on the finished piece. */}
          <p className="text-xs text-thread/70 mt-1.5">
            Case sensitive — write it exactly as you want it produced.
          </p>
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
            aria-invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass}${error ? " border-oxblood" : ""}`}
          />
          {errorLine}
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
            aria-invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass}${error ? " border-oxblood" : ""}`}
          />
          {errorLine}
          {/* This value is reproduced verbatim on the finished piece. */}
          <p className="text-xs text-thread/70 mt-1.5">
            Case sensitive — write it exactly as you want it produced.
          </p>
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
