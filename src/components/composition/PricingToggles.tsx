"use client";

export function PricingToggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "on-primary rounded-[4px] bg-[var(--color-primary-500)] px-1.5 py-0.5 text-[10px] font-medium"
          : "rounded-[4px] bg-[var(--color-surface-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
      }
    >
      {label}
    </button>
  );
}

export function MaterialPricingToggles({
  costVatMode,
  priceMode,
  hasCut,
  onCostVatMode,
  onPriceMode,
}: {
  costVatMode?: "NET" | "GROSS" | null;
  priceMode?: "auto" | "cut" | "wholesale" | null;
  hasCut: boolean;
  onCostVatMode: (mode: "NET" | "GROSS") => void;
  onPriceMode: (mode: "auto" | "cut" | "wholesale") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <PricingToggle
        active={costVatMode === "NET"}
        label="без ПДВ"
        onClick={() => onCostVatMode("NET")}
      />
      <PricingToggle
        active={costVatMode === "GROSS"}
        label="з ПДВ"
        onClick={() => onCostVatMode("GROSS")}
      />
      {hasCut && costVatMode ? (
        <>
          <span className="mx-0.5 text-[10px] text-[var(--color-text-tertiary)]">|</span>
          <PricingToggle active={priceMode === "auto"} label="авто" onClick={() => onPriceMode("auto")} />
          <PricingToggle active={priceMode === "cut"} label="роздріб" onClick={() => onPriceMode("cut")} />
          <PricingToggle
            active={priceMode === "wholesale"}
            label="ціна"
            onClick={() => onPriceMode("wholesale")}
          />
        </>
      ) : null}
    </div>
  );
}
