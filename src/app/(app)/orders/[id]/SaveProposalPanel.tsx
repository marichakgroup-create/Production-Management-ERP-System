"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormGroup, Textarea } from "@/components/ui/Field";
import { SidePanel } from "@/components/ui/Overlay";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";
import { useUnsavedCloseGuard } from "@/hooks/useUnsavedCloseGuard";
import { useOrderUnsavedWorkspaceDirty } from "@/components/orders/OrderUnsavedContext";
import { IconPlus } from "@/components/ui/Icons";
import { saveProposalAction } from "@/server/domains/orders/actions";
import { quoteClientLine } from "@/lib/order-item-commercial";
import {
  OVERSIZE_CLIENT_SURCHARGE_PERCENT,
  oversizeSurchargeComment,
} from "@/lib/oversize-surcharge";
import { formatMoneyUah, roundMoneyUah } from "@/lib/utils";

export type ProposalDraftLine = {
  orderItemId: string;
  nameUk: string;
  totalQuantity: number;
  /** Size breakdown under the product name, e.g. «S 2 · M 10». */
  sizeRun?: string;
  costPerUnit: number;
  sellingPricePerUnit: number;
  marginPercent: number;
  totalSellingValue: number;
  fromPriceList?: boolean;
  basePricePerUnit?: number | null;
  decorationPerUnit?: number | null;
  priceSource?: "pricelist" | "sewing_markup" | "cost" | "proposal";
  oversizeSurcharge?: {
    perUnit: number;
    total: number;
    quantity: number;
    percent?: number;
  } | null;
};

type PriceOverride = {
  product?: number;
  decoration?: number;
};

type QuotedLine = ProposalDraftLine & {
  catalogProductPricePerUnit: number;
  catalogDecorationPerUnit: number;
  quotedProductPricePerUnit: number;
  quotedDecorationPerUnit: number;
  oversizeExtraPerUnit: number;
  oversizeQuantity: number;
};

function parseDiscount(raw: string): number {
  if (!raw.trim()) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(99, value));
}

function catalogDecorationPrice(line: ProposalDraftLine): number {
  return roundMoneyUah(Math.max(0, line.decorationPerUnit ?? 0));
}

function catalogProductPrice(line: ProposalDraftLine): number {
  if (line.basePricePerUnit != null && Number.isFinite(line.basePricePerUnit)) {
    return roundMoneyUah(Math.max(0, line.basePricePerUnit));
  }
  const deco = catalogDecorationPrice(line);
  const extraBlended =
    line.totalQuantity > 0 ? (line.oversizeSurcharge?.total ?? 0) / line.totalQuantity : 0;
  return roundMoneyUah(Math.max(0, line.sellingPricePerUnit - deco - extraBlended));
}

function quoteProposalLine(
  catalog: ProposalDraftLine,
  override: PriceOverride | undefined,
  discountPercent: number,
): QuotedLine {
  const catalogProductPricePerUnit = override?.product ?? catalogProductPrice(catalog);
  const catalogDecorationPerUnit = override?.decoration ?? catalogDecorationPrice(catalog);
  const quoted = quoteClientLine({
    quantity: catalog.totalQuantity,
    productPricePerUnit: catalogProductPricePerUnit,
    decorationPerUnit: catalogDecorationPerUnit,
    discountPercent,
    oversizeQuantity: catalog.oversizeSurcharge?.quantity ?? 0,
    costPerUnit: catalog.costPerUnit,
  });
  return {
    ...catalog,
    catalogProductPricePerUnit,
    catalogDecorationPerUnit,
    quotedProductPricePerUnit: quoted.productPricePerUnit,
    quotedDecorationPerUnit: quoted.decorationPerUnit,
    oversizeExtraPerUnit: quoted.oversizeSurcharge.perUnit,
    oversizeQuantity: quoted.oversizeQuantity,
    sellingPricePerUnit: quoted.sellingPricePerUnit,
    totalSellingValue: quoted.totalSellingValue,
    marginPercent: quoted.marginPercent,
    oversizeSurcharge: quoted.oversizeSurcharge,
  };
}

export function SaveProposalPanel({
  orderId,
  lines: initialLines,
  accent = true,
  defaultOpen = false,
}: {
  orderId: string;
  lines: ProposalDraftLine[];
  /** @deprecated Kept for call-site compatibility; no longer gates saving. */
  minimumMarginPercent?: number;
  accent?: boolean;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [discountPercent, setDiscountPercent] = useState("");
  const [proposalLabel, setProposalLabel] = useState("");
  const [proposalComment, setProposalComment] = useState("");
  const [manualOverrides, setManualOverrides] = useState<Map<string, PriceOverride>>(
    () => new Map(),
  );

  const initialKey = useMemo(
    () =>
      JSON.stringify(
        initialLines.map((line) => ({
          id: line.orderItemId,
          q: line.totalQuantity,
          p: line.sellingPricePerUnit,
          b: line.basePricePerUnit,
          d: line.decorationPerUnit,
          o: line.oversizeSurcharge?.quantity ?? 0,
          c: line.costPerUnit,
        })),
      ),
    [initialLines],
  );

  const catalogLines = useMemo(
    () => initialLines,
    [initialKey, initialLines],
  );

  useEffect(() => {
    setManualOverrides(new Map());
    setDiscountPercent("");
    setProposalLabel("");
    setProposalComment("");
    setError(null);
  }, [initialKey]);

  const dirty =
    Boolean(proposalLabel.trim()) ||
    Boolean(proposalComment.trim()) ||
    Boolean(discountPercent.trim()) ||
    manualOverrides.size > 0;

  const resetAndClose = useCallback(() => {
    setOpen(false);
    setManualOverrides(new Map());
    setDiscountPercent("");
    setProposalLabel("");
    setProposalComment("");
    setError(null);
  }, []);

  const { leaveOpen, requestClose, stay, discard } = useUnsavedCloseGuard({
    dirty,
    pending,
    onDiscard: resetAndClose,
  });
  useOrderUnsavedWorkspaceDirty(dirty);

  const lines = useMemo(() => {
    const discount = parseDiscount(discountPercent);
    return catalogLines.map((catalog) =>
      quoteProposalLine(catalog, manualOverrides.get(catalog.orderItemId), discount),
    );
  }, [catalogLines, discountPercent, manualOverrides]);

  const totalValue = useMemo(
    () => lines.reduce((sum, line) => sum + line.totalSellingValue, 0),
    [lines],
  );
  const totalProduct = useMemo(
    () =>
      lines.reduce(
        (sum, line) => sum + roundMoneyUah(line.quotedProductPricePerUnit * line.totalQuantity),
        0,
      ),
    [lines],
  );
  const totalDecoration = useMemo(
    () =>
      lines.reduce(
        (sum, line) => sum + roundMoneyUah(line.quotedDecorationPerUnit * line.totalQuantity),
        0,
      ),
    [lines],
  );
  const totalOversize = useMemo(
    () => lines.reduce((sum, line) => sum + (line.oversizeSurcharge?.total ?? 0), 0),
    [lines],
  );
  const totalQty = useMemo(
    () => lines.reduce((sum, line) => sum + line.totalQuantity, 0),
    [lines],
  );

  function updatePrice(orderItemId: string, field: keyof PriceOverride, raw: string) {
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0) return;
    setManualOverrides((prev) => {
      const next = new Map(prev);
      const current = next.get(orderItemId) ?? {};
      next.set(orderItemId, { ...current, [field]: roundMoneyUah(price) });
      return next;
    });
  }

  function submit() {
    setError(null);
    const formData = new FormData();
    formData.set("orderId", orderId);
    const discount = discountPercent.trim() ? parseDiscount(discountPercent) : null;
    formData.set(
      "linesJson",
      JSON.stringify(
        lines.map((line) => ({
          orderItemId: line.orderItemId,
          manualBasePricePerUnit: line.catalogProductPricePerUnit,
          manualDecorationPerUnit: line.catalogDecorationPerUnit,
          discountPercent: discount,
        })),
      ),
    );
    if (proposalLabel.trim()) formData.set("label", proposalLabel.trim());
    if (proposalComment.trim()) formData.set("comment", proposalComment.trim());

    startTransition(async () => {
      const result = await saveProposalAction(formData);
      if (!result.ok) {
        const messages: Record<string, string> = {
          ORDER_LOCKED: "Замовлення заблоковано для редагування.",
          EMPTY_ORDER_NOT_ALLOWED:
            "Порожнє замовлення можна зберігати лише на Чернетці або Розрахунку.",
          USE_NEW_PROPOSAL: "Замовлення вже погоджене. Натисніть «Нова пропозиція».",
          INCOMPLETE: "У кожній позиції мають бути матеріали та операції.",
          NO_QUANTITY: "У кожній позиції кількість має бути більшою за нуль.",
          MISSING_LINE: "Пропозиція не покриває всі позиції — оновіть список і спробуйте знову.",
          FIXED_COSTS_INVALID: "Перевірте параметри постійних витрат у налаштуваннях.",
        };
        setError(
          ("message" in result && typeof result.message === "string" && result.message) ||
            messages[result.error] ||
            "Не вдалося зберегти пропозицію. Перевірте склад усіх позицій.",
        );
        return;
      }
      resetAndClose();
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant={accent ? "primary" : "secondary"}
        size="sm"
        onClick={() => setOpen(true)}
        hint="saveProposal"
      >
        <IconPlus size={15} />
        Зберегти пропозицію
      </Button>

      <SidePanel
        open={open}
        onClose={requestClose}
        title="Зберегти пропозицію для клієнта"
        description="Виріб і нанесення окремо. Знижка — на обидві позиції; +20% за 3XL+ лише на виріб."
        width="2xl"
        footer={
          <>
            {error ? <span className="type-caption mr-auto text-[var(--color-danger-text)]">{error}</span> : null}
            <Button variant="ghost" onClick={requestClose} disabled={pending}>
              Скасувати
            </Button>
            <Button onClick={submit} disabled={pending || lines.length === 0}>
              {pending ? "Збереження…" : "Зберегти пропозицію"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormGroup label="Ідентифікація" columns={2}>
            <Input
              label="Назва пропозиції"
              placeholder="Пропозиція для клієнта"
              value={proposalLabel}
              onChange={(event) => setProposalLabel(event.target.value)}
            />
            <Input
              label="Знижка, %"
              type="number"
              min={0}
              max={99}
              step="0.1"
              value={discountPercent}
              onChange={(event) => setDiscountPercent(event.target.value)}
            />
          </FormGroup>

          <div className="overflow-x-auto overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-border)]">
            <table className="erp-table w-full min-w-[52rem] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-table-section-border)]">
                  <th className="px-3 py-2 text-left">Виріб</th>
                  <th className="px-3 py-2 text-right">К-сть</th>
                  <th className="px-3 py-2 text-right">Собівартість/од.</th>
                  <th className="px-3 py-2 text-right">Виріб ₴/од.</th>
                  <th className="px-3 py-2 text-right">Нанесення ₴/од.</th>
                  <th className="px-3 py-2 text-right">
                    +{OVERSIZE_CLIENT_SURCHARGE_PERCENT}% 3XL+
                  </th>
                  <th className="px-3 py-2 text-right">Сума</th>
                  <th className="px-3 py-2 text-right">Маржа</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const discount = parseDiscount(discountPercent);
                  const overridden = manualOverrides.has(line.orderItemId);
                  return (
                    <tr key={line.orderItemId} className="border-b border-[var(--color-divider)] align-top">
                      <td className="px-3 py-2 font-medium">
                        <p>
                          {line.nameUk}
                          {line.fromPriceList ? (
                            <span className="type-caption ml-1 text-[var(--color-primary-700)]">прайс</span>
                          ) : null}
                          {overridden ? (
                            <span className="type-caption ml-1 text-[var(--color-text-secondary)]">ручна</span>
                          ) : null}
                        </p>
                        {line.sizeRun ? (
                          <p className="type-caption mt-0.5 tabular font-normal text-[var(--color-text-secondary)]">
                            {line.sizeRun}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular">{line.totalQuantity} шт</td>
                      <td className="px-3 py-2 text-right tabular text-[var(--color-text-secondary)]">
                        {formatMoneyUah(line.costPerUnit)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={line.catalogProductPricePerUnit.toFixed(1)}
                          onChange={(event) =>
                            updatePrice(line.orderItemId, "product", event.target.value)
                          }
                          className="h-8 w-[6.5rem] rounded-[6px] border border-[var(--color-border)] px-2 text-right tabular outline-none focus:border-[var(--color-primary-500)]"
                          aria-label="Ціна виробу за одиницю"
                        />
                        {discount > 0 ? (
                          <p className="type-caption mt-0.5 tabular text-[var(--color-text-secondary)]">
                            після знижки {formatMoneyUah(line.quotedProductPricePerUnit)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={line.catalogDecorationPerUnit.toFixed(1)}
                          onChange={(event) =>
                            updatePrice(line.orderItemId, "decoration", event.target.value)
                          }
                          className="h-8 w-[6.5rem] rounded-[6px] border border-[var(--color-border)] px-2 text-right tabular outline-none focus:border-[var(--color-primary-500)]"
                          aria-label="Ціна нанесення за одиницю"
                        />
                        {discount > 0 ? (
                          <p className="type-caption mt-0.5 tabular text-[var(--color-text-secondary)]">
                            після знижки {formatMoneyUah(line.quotedDecorationPerUnit)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {line.oversizeQuantity > 0 ? (
                          <>
                            <p className="font-medium">
                              {formatMoneyUah(line.oversizeSurcharge?.total ?? 0)}
                            </p>
                            <p className="type-caption mt-0.5 text-[var(--color-warning-text)]">
                              {oversizeSurchargeComment(line.oversizeExtraPerUnit) ??
                                `+${OVERSIZE_CLIENT_SURCHARGE_PERCENT}%`}{" "}
                              · {line.oversizeQuantity} шт
                            </p>
                          </>
                        ) : (
                          <span className="text-[var(--color-text-secondary)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular">
                        {formatMoneyUah(line.totalSellingValue)}
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {line.marginPercent.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="px-3 py-2.5 text-right type-caption">
                    Разом виріб {formatMoneyUah(totalProduct)}
                    <span className="mx-2 text-[var(--color-divider)]">·</span>
                    Разом нанесення {formatMoneyUah(totalDecoration)}
                    {totalOversize > 0.05 ? (
                      <>
                        <span className="mx-2 text-[var(--color-divider)]">·</span>
                        Надбавка 3XL+ {formatMoneyUah(totalOversize)}
                      </>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold">Разом до сплати</td>
                  <td className="px-3 py-2.5 text-right text-[15px] font-semibold tabular">
                    {formatMoneyUah(totalValue)}
                  </td>
                  <td className="px-3 py-2.5 text-right type-caption tabular">{totalQty} шт</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <FormGroup label="Коментар" columns={1}>
            <Textarea
              label="Що змінилось"
              placeholder="Причина зміни ціни або складу"
              value={proposalComment}
              onChange={(event) => setProposalComment(event.target.value)}
            />
          </FormGroup>
        </div>
      </SidePanel>
      <UnsavedChangesDialog
        open={leaveOpen}
        pending={pending}
        onStay={stay}
        onDiscard={discard}
      />
    </>
  );
}
