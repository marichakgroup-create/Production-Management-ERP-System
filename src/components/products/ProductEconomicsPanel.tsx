"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { CostSummary } from "@/components/calc/CostSummary";
import type { CalculationResult } from "@/server/domains/calculation/engine";
import { previewProductEconomicsAction } from "@/server/domains/products/actions";
import type { ResolvedClientPrice } from "@/lib/product-selling";
import { formatMoneyUah } from "@/lib/utils";

function priceSourceSubtitle(quantity: number, price: ResolvedClientPrice | null): string {
  if (!price) return `Тираж ${quantity} шт`;
  if (price.source === "pricelist") {
    return `Тираж ${quantity} шт · ціна з прайсу виробу (вкладка «Прайс і крій»)`;
  }
  if (price.source === "sewing_markup") {
    const uplift = Math.round(price.sewingPerUnit * price.sewingMultiplier * 100) / 100;
    return `Тираж ${quantity} шт · націнка = пошив ${formatMoneyUah(price.sewingPerUnit)} × ${price.sewingMultiplier} = +${formatMoneyUah(uplift)}`;
  }
  return `Тираж ${quantity} шт · ціна = собівартість (прайсу немає, націнки немає)`;
}

export function ProductEconomicsPanel({
  productId,
  initialCalc,
  initialQuantity = 100,
  minimumMarginPercent,
  onPreviewChange,
}: {
  productId: string;
  initialCalc: CalculationResult;
  initialQuantity?: number;
  minimumMarginPercent: number;
  onPreviewChange?: (quantity: number) => void;
}) {
  const [quantityInput, setQuantityInput] = useState(String(initialQuantity));
  const [calc, setCalc] = useState(initialCalc);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [priceSource, setPriceSource] = useState<ResolvedClientPrice | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const parsed = Math.max(1, Math.floor(Number(quantityInput) || 0));
    if (!Number.isFinite(parsed) || parsed < 1) return;

    onPreviewChange?.(parsed);

    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await previewProductEconomicsAction(productId, parsed);
        if (result.ok) {
          setCalc(result.calc);
          setQuantity(result.quantity);
          setPriceSource(result.priceSource);
        }
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [productId, quantityInput, onPreviewChange]);

  const markupPerUnit =
    Math.round((Number(calc.sellingPricePerUnit) - Number(calc.costPerUnit)) * 100) / 100;

  return (
    <div className="overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <Input
          label="Тираж для розрахунку, шт"
          type="number"
          min={1}
          step={1}
          value={quantityInput}
          onChange={(event) => setQuantityInput(event.target.value)}
          hint="Матеріали, крій, операції за tier і додаткові витрати — від тиражу. Нанесення лише в замовленні."
        />
      </div>

      <CostSummary
        calc={calc}
        quantity={quantity}
        title="Економіка партії"
        subtitle={pending ? "Перерахунок…" : priceSourceSubtitle(quantity, priceSource)}
        minimumMarginPercent={minimumMarginPercent}
        className="border-0 shadow-none"
        footer={
          <div className="space-y-3">
            {priceSource ? (
              <div className="rounded-[10px] border border-[var(--color-divider)] bg-[var(--color-bg)]/40 px-3 py-2.5 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
                {priceSource.source === "pricelist" ? (
                  <>
                    <p>
                      <span className="font-medium text-[var(--color-text)]">Звідки ціна:</span>{" "}
                      сходинка прайсу для цього тиражу.
                    </p>
                    <p className="mt-1">
                      Націнка / од. {formatMoneyUah(markupPerUnit)} = ціна{" "}
                      {formatMoneyUah(Number(calc.sellingPricePerUnit))} − собівартість{" "}
                      {formatMoneyUah(Number(calc.costPerUnit))} (не окрема формула — просто
                      різниця з прайсу).
                    </p>
                  </>
                ) : priceSource.source === "sewing_markup" ? (
                  <>
                    <p>
                      <span className="font-medium text-[var(--color-text)]">Звідки ціна:</span>{" "}
                      собівартість + націнка на пошив (прайсу немає або порожній).
                    </p>
                    <p className="mt-1 tabular-nums">
                      {formatMoneyUah(Number(calc.costPerUnit))} +{" "}
                      {formatMoneyUah(priceSource.sewingPerUnit)} ×{" "}
                      {priceSource.sewingMultiplier} ={" "}
                      {formatMoneyUah(Number(calc.sellingPricePerUnit))}
                    </p>
                    <p className="mt-1">
                      Пошив береться з операції «Пошив»; множник ×
                      {priceSource.sewingMultiplier} — за тиражем (до 30→×7, …, 100→×5, …).
                    </p>
                  </>
                ) : (
                  <p>
                    <span className="font-medium text-[var(--color-text)]">Звідки ціна:</span>{" "}
                    дорівнює собівартості — немає прайсу і немає ставки пошиву для націнки.
                  </p>
                )}
              </div>
            ) : null}
            <Link
              href={`/orders/new?productId=${productId}`}
              className="btn-primary btn-primary-sm w-full"
            >
              Створити замовлення на виріб
            </Link>
          </div>
        }
      />
    </div>
  );
}
