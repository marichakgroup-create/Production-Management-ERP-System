"use client";

import { useEffect, useState } from "react";

export type SizeRunItem = { code: string; nameUk: string };

function isCompactSizeLabel(size: SizeRunItem) {
  return size.code !== "ONE" && size.nameUk.length <= 4;
}

function parseQuantity(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const value = Math.floor(Number(trimmed));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function buildQuantityMap(sizes: SizeRunItem[], quantities: Record<string, number>) {
  return Object.fromEntries(sizes.map((size) => [size.code, quantities[size.code] ?? 0]));
}

export function SizeRun({
  sizes,
  quantities,
  onChange,
  disabled,
  withHiddenFields,
  dense = true,
  quiet = false,
}: {
  sizes: SizeRunItem[];
  quantities: Record<string, number>;
  onChange: (code: string, quantity: number) => void;
  disabled?: boolean;
  withHiddenFields?: boolean;
  dense?: boolean;
  quiet?: boolean;
}) {
  const [localQty, setLocalQty] = useState<Record<string, number>>(() =>
    buildQuantityMap(sizes, quantities),
  );
  const sizeCodesKey = sizes.map((size) => size.code).join("|");
  const quantitiesSig = sizes.map((size) => `${size.code}:${quantities[size.code] ?? 0}`).join("|");

  useEffect(() => {
    setLocalQty(buildQuantityMap(sizes, quantities));
  }, [sizeCodesKey, quantitiesSig]);

  const total = sizes.reduce((sum, size) => sum + (localQty[size.code] || 0), 0);
  const inputH = quiet ? "h-6" : dense ? "h-7" : "h-9";
  const textSize = quiet ? "text-[12px]" : dense ? "text-[12.5px]" : "text-[13.5px]";
  const inputBorder = quiet
    ? "border-[var(--color-border)] bg-transparent focus:bg-[var(--color-surface)]"
    : "border-[var(--color-border-strong)] bg-[var(--color-surface)]";
  const inputClass = `tabular ${inputH} rounded-[5px] border ${inputBorder} px-1 text-center ${textSize} outline-none transition-colors focus:border-[var(--color-primary-500)] focus:ring-1 focus:ring-[var(--color-focus-ring)] disabled:bg-[var(--color-surface-subtle)] disabled:text-[var(--color-text-secondary)]`;

  function handleInput(code: string, raw: string) {
    const quantity = parseQuantity(raw.replace(/[^\d]/g, ""));
    setLocalQty((prev) => (prev[code] === quantity ? prev : { ...prev, [code]: quantity }));
    onChange(code, quantity);
  }

  function displayValue(code: string) {
    const quantity = localQty[code] ?? 0;
    return quantity > 0 ? String(quantity) : "";
  }

  function quantityInputProps(size: SizeRunItem) {
    return {
      type: "text" as const,
      inputMode: "numeric" as const,
      pattern: "[0-9]*",
      autoComplete: "off",
      disabled,
      value: displayValue(size.code),
      // Only onChange — onInput+onChange double-fired on some browsers and raced saves.
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        handleInput(size.code, event.target.value),
    };
  }

  return (
    <div className="flex flex-wrap items-end gap-1.5">
      {sizes.map((size) => {
        const compact = isCompactSizeLabel(size);
        const hidden = withHiddenFields ? (
          <>
            <input type="hidden" name="sizeCode" value={size.code} />
            <input type="hidden" name="sizeNameUk" value={size.nameUk} />
            <input type="hidden" name="sizeQty" value={localQty[size.code] ?? 0} />
          </>
        ) : null;

        if (!compact) {
          return (
            <label key={size.code} className="inline-flex items-center gap-1.5">
              {hidden}
              <span
                className="max-w-[9rem] shrink-0 text-[11px] font-medium text-[var(--color-text-tertiary)]"
                title={size.nameUk}
              >
                {size.nameUk}
              </span>
              <input
                {...quantityInputProps(size)}
                aria-label={size.nameUk}
                className={`${inputClass} w-14`}
              />
            </label>
          );
        }

        return (
          <label key={size.code} className={`block shrink-0 ${quiet ? "w-[44px]" : dense ? "w-[52px]" : "w-[72px]"}`}>
            {hidden}
            <span
              className={`mb-0.5 block text-center font-medium tracking-[0.03em] text-[var(--color-text-tertiary)] uppercase ${quiet ? "text-[10px]" : "text-[10.5px] font-semibold"}`}
              title={size.nameUk}
            >
              {size.nameUk}
            </span>
            <input
              {...quantityInputProps(size)}
              aria-label={size.nameUk}
              className={`${inputClass} w-full`}
            />
          </label>
        );
      })}

      <div className="mb-0.5 ml-0.5 flex items-center gap-1 border-l border-[var(--color-divider)] pl-1.5">
        <span className="text-[10.5px] text-[var(--color-text-tertiary)]">Разом</span>
        <span className={`tabular ${textSize} font-semibold text-[var(--color-text-primary)]`}>
          {total} шт
        </span>
      </div>
    </div>
  );
}
