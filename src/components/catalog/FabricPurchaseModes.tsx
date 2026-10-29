"use client";

import { cn } from "@/lib/utils";

/** Dense segmented control — active = solid green. */
export function ModeSegment<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label?: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {label ? (
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--color-text-tertiary)]">
          {label}
        </span>
      ) : null}
      <div className="inline-flex items-center gap-0.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-0.5">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                "rounded-[6px] px-2 py-1 text-[11.5px] font-semibold leading-none transition-colors",
                active
                  ? "on-primary bg-[var(--color-primary-500)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One compact row for purchase mode toggles. */
export function PurchaseModeRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sm:col-span-full flex flex-wrap items-center gap-x-3 gap-y-1.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type { FabricQuoteCurrency, FabricQuoteUnit } from "@/lib/fabric-pricing";
export type FabricQuoteMode = "meter" | "kg";
export type FabricTierMode = "single" | "tier";
export type FabricDeliveryUiMode = "kg" | "none";

export type UnitQuoteMode = "each" | "pack" | "kg";
/**
 * Unit-material delivery:
 * - kg — CARGO / НП тарифи $/кг (як тканина)
 * - fixed — фікс сума на пачку/поставку (₴ або $ → зберігається в ₴)
 * - none — без доставки
 */
export type UnitDeliveryUiMode = "kg" | "fixed" | "none";

export type MoneyCurrency = "uah" | "usd";

/** Convert entered amount to stored ₴. */
export function amountToUah(
  amount: number,
  currency: MoneyCurrency,
  usdUahRate: number,
): number {
  if (!(Number.isFinite(amount) && amount >= 0)) return 0;
  if (currency === "usd") {
    if (!(usdUahRate > 0)) return amount;
    return Math.round(amount * usdUahRate * 10000) / 10000;
  }
  return amount;
}

/** Show stored ₴ in the active currency. */
export function amountFromUah(
  uah: number,
  currency: MoneyCurrency,
  usdUahRate: number,
): number {
  if (!(Number.isFinite(uah) && uah >= 0)) return 0;
  if (currency === "usd") {
    if (!(usdUahRate > 0)) return uah;
    return Math.round((uah / usdUahRate) * 10000) / 10000;
  }
  return uah;
}

export function inferFabricQuoteMode(input: {
  priceKgUsd?: string | number | null;
}): FabricQuoteMode {
  const raw = input.priceKgUsd;
  if (raw == null || raw === "") return "meter";
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? "kg" : "meter";
}

/** Infer currency: $/кг stored → USD, else UAH (₴/м canonical). */
export function inferFabricQuoteCurrency(input: {
  priceKgUsd?: string | number | null;
}): import("@/lib/fabric-pricing").FabricQuoteCurrency {
  return inferFabricQuoteMode(input) === "kg" ? "usd" : "uah";
}

export function inferFabricQuoteUnit(input: {
  priceKgUsd?: string | number | null;
}): import("@/lib/fabric-pricing").FabricQuoteUnit {
  return inferFabricQuoteMode(input);
}

export function inferFabricTierMode(input: {
  minWholesaleMeters?: string | number | null;
  priceMeterUahCutVat?: string | number | null;
}): FabricTierMode {
  const minRaw = input.minWholesaleMeters;
  const cutRaw = input.priceMeterUahCutVat;
  const min =
    minRaw == null || minRaw === ""
      ? 0
      : typeof minRaw === "number"
        ? minRaw
        : Number(String(minRaw).replace(",", "."));
  const cut =
    cutRaw == null || cutRaw === ""
      ? 0
      : typeof cutRaw === "number"
        ? cutRaw
        : Number(String(cutRaw).replace(",", "."));
  return (Number.isFinite(min) && min > 0) || (Number.isFinite(cut) && cut > 0)
    ? "tier"
    : "single";
}

export function inferFabricDeliveryUiMode(input: {
  cargoUsdPerKg?: string | number | null;
  npStandardUsdPerKg?: string | number | null;
  npVolumeUsdPerKg?: string | number | null;
}): FabricDeliveryUiMode {
  const values = [input.cargoUsdPerKg, input.npStandardUsdPerKg, input.npVolumeUsdPerKg];
  for (const raw of values) {
    if (raw == null || raw === "") continue;
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
    if (Number.isFinite(n) && n >= 0) return "kg";
  }
  return "none";
}

export function inferUnitQuoteMode(input: {
  purchasePackPrice?: string | number | null;
  priceKgUsd?: string | number | null;
}): UnitQuoteMode {
  const kgRaw = input.priceKgUsd;
  if (kgRaw != null && kgRaw !== "") {
    const kg = typeof kgRaw === "number" ? kgRaw : Number(String(kgRaw).replace(",", "."));
    if (Number.isFinite(kg) && kg >= 0) return "kg";
  }
  const raw = input.purchasePackPrice;
  if (raw == null || raw === "") return "each";
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? "pack" : "each";
}

function hasNonNeg(raw: string | number | null | undefined): boolean {
  if (raw == null || raw === "") return false;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  return Number.isFinite(n) && n >= 0;
}

export function inferUnitDeliveryUiMode(input: {
  cargoUsdPerKg?: string | number | null;
  npStandardUsdPerKg?: string | number | null;
  npVolumeUsdPerKg?: string | number | null;
  packDeliveryCostUah?: string | number | null;
}): UnitDeliveryUiMode {
  if (hasNonNeg(input.packDeliveryCostUah)) return "fixed";
  if (inferFabricDeliveryUiMode(input) === "kg") return "kg";
  return "none";
}
