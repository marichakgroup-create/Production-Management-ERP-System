"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOversizeCoeffsAction } from "@/server/domains/settings/actions";
import { OVERSIZE_RANGE_LABEL } from "@/lib/size-coeffs";
import { cn } from "@/lib/utils";

/**
 * Right-aligned 3XL–6XL uplift controls next to size tabs.
 * Edits company SizeRule for 3XL / 4XL / 5XL / 6XL (shared %).
 */
export function OversizeCoeffFields({
  materialPct,
  operationPct,
  disabled,
  className,
}: {
  materialPct: number;
  operationPct: number;
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mat, setMat] = useState(String(materialPct));
  const [ops, setOps] = useState(String(operationPct));

  useEffect(() => {
    setMat(String(materialPct));
    setOps(String(operationPct));
  }, [materialPct, operationPct]);

  function save(nextMat: string, nextOps: string) {
    const material = Math.max(0, Number(nextMat) || 0);
    const operation = Math.max(0, Number(nextOps) || 0);
    if (material === materialPct && operation === operationPct) return;
    const formData = new FormData();
    formData.set("materialPct", String(material));
    formData.set("operationPct", String(operation));
    startTransition(async () => {
      await updateOversizeCoeffsAction(formData);
      router.refresh();
    });
  }

  const inputClass =
    "h-7 w-12 rounded-[6px] border border-[var(--color-border)] bg-white px-1.5 text-right text-[12px] tabular outline-none focus:border-[var(--color-primary-500)] disabled:opacity-60";

  return (
    <div
      className={cn(
        "flex shrink-0 flex-nowrap items-center justify-end gap-x-3 whitespace-nowrap",
        className,
      )}
      title="Надбавка для великих розмірів до базової специфікації. Діє для всіх виробів у замовленні."
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-quiet)]">
        {OVERSIZE_RANGE_LABEL}
      </span>
      <label className="inline-flex items-center gap-1 text-[11.5px] text-[var(--color-text-secondary)]">
        мат.
        <input
          type="number"
          min={0}
          max={200}
          step={1}
          value={mat}
          disabled={disabled || pending}
          onChange={(event) => setMat(event.target.value)}
          onBlur={() => save(mat, ops)}
          className={inputClass}
          aria-label={`Надбавка матеріалів для ${OVERSIZE_RANGE_LABEL}`}
        />
        <span>%</span>
      </label>
      <label className="inline-flex items-center gap-1 text-[11.5px] text-[var(--color-text-secondary)]">
        оп.
        <input
          type="number"
          min={0}
          max={200}
          step={1}
          value={ops}
          disabled={disabled || pending}
          onChange={(event) => setOps(event.target.value)}
          onBlur={() => save(mat, ops)}
          className={inputClass}
          aria-label={`Надбавка операцій для ${OVERSIZE_RANGE_LABEL}`}
        />
        <span>%</span>
      </label>
    </div>
  );
}
