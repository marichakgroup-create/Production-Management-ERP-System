"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { IconPlus } from "@/components/ui/Icons";
import { SoftBusy } from "@/components/ui/SoftBusy";
import { addOrderDecorationFormatAction } from "@/server/domains/decoration-formats/actions";
import {
  mapDecorationFormatTiers,
  resolveDecorationFormatRate,
} from "@/lib/decoration-format-pricing";
import { formatMoneyUah } from "@/lib/utils";
import type { DecorationFormatCatalogRow } from "@/server/domains/decoration-formats/service";

/**
 * Pick an application format → always inserts a new decoration line.
 * Same format may be added multiple times (e.g. two «5×5» placements).
 */
export function OrderDecorationFormatPicker({
  orderId,
  orderItemId,
  quantity,
  formats,
  locked,
  hideCosts = false,
}: {
  orderId: string;
  orderItemId: string;
  quantity: number;
  formats: DecorationFormatCatalogRow[];
  locked?: boolean;
  hideCosts?: boolean;
}) {
  const router = useRouter();
  const [formatId, setFormatId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const options = useMemo(() => {
    return formats
      .filter((row) => row.status === "ACTIVE")
      .map((row) => {
        const unitRate = resolveDecorationFormatRate({
          quantity,
          tiers: mapDecorationFormatTiers(row.tiers),
        });
        return {
          id: row.id,
          label: hideCosts
            ? row.nameUk
            : `${row.nameUk} · ${formatMoneyUah(unitRate)}/шт`,
          unitRate,
        };
      });
  }, [formats, quantity, hideCosts]);

  const preview = options.find((row) => row.id === formatId) ?? null;

  if (locked) return null;

  function add() {
    if (!formatId) {
      setError("Оберіть формат");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addOrderDecorationFormatAction({
        orderId,
        orderItemId,
        formatId,
      });
      if (!result.ok) {
        setError(
          result.error === "NO_RATE"
            ? "Немає ставки для цього формату"
            : "Не вдалося додати нанесення",
        );
        return;
      }
      setFormatId("");
      router.refresh();
    });
  }

  return (
    <SoftBusy busy={pending}>
      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--color-border)] pt-3">
        <div className="min-w-[14rem] flex-1">
          <Select
            label="Формат нанесення"
            value={formatId}
            disabled={pending || options.length === 0}
            onChange={(event) => {
              setFormatId(event.target.value);
              setError(null);
            }}
          >
            <option value="">
              {options.length === 0 ? "Немає форматів у довіднику" : "Оберіть формат…"}
            </option>
            {options.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </Select>
        </div>
        {!hideCosts && preview ? (
          <p className="type-caption pb-2 text-[var(--color-text-secondary)]">
            {formatMoneyUah(preview.unitRate)}/шт за тиражем {quantity}
          </p>
        ) : null}
        <Button
          type="button"
          size="sm"
          onClick={add}
          disabled={pending || !formatId}
          className="shrink-0"
        >
          <IconPlus size={14} />
          Додати
        </Button>
        {error ? (
          <p className="basis-full text-[12.5px] text-[var(--color-danger-text)]">{error}</p>
        ) : null}
      </div>
    </SoftBusy>
  );
}
