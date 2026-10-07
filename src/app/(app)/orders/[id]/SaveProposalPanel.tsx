"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormGroup, Textarea } from "@/components/ui/Field";
import { SidePanel } from "@/components/ui/Overlay";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";
import { useUnsavedCloseGuard } from "@/hooks/useUnsavedCloseGuard";
import { IconPlus } from "@/components/ui/Icons";
import { saveProposalAction } from "@/server/domains/orders/actions";
import { formatMoneyUah } from "@/lib/utils";

export type ProposalDraftLine = {
  orderItemId: string;
  nameUk: string;
  totalQuantity: number;
  costPerUnit: number;
  sellingPricePerUnit: number;
  marginPercent: number;
  totalSellingValue: number;
  fromPriceList?: boolean;
  basePricePerUnit?: number | null;
};

type CatalogLine = ProposalDraftLine & { catalogSellingPricePerUnit: number };

function lineFromCatalog(
  catalog: CatalogLine,
  sellingPricePerUnit: number,
): ProposalDraftLine {
  const totalSellingValue = sellingPricePerUnit * catalog.totalQuantity;
  const totalCost = catalog.costPerUnit * catalog.totalQuantity;
  const profit = totalSellingValue - totalCost;
  const marginPercent = totalSellingValue > 0 ? (profit / totalSellingValue) * 100 : 0;
  return {
    ...catalog,
    sellingPricePerUnit,
    totalSellingValue,
    marginPercent,
  };
}

function parseDiscount(raw: string): number {
  if (!raw.trim()) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(99, value));
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
  const [manualOverrides, setManualOverrides] = useState<Map<string, number>>(() => new Map());

  const initialKey = useMemo(
    () =>
      JSON.stringify(
        initialLines.map((line) => ({
          id: line.orderItemId,
          q: line.totalQuantity,
          p: line.sellingPricePerUnit,
          c: line.costPerUnit,
        })),
      ),
    [initialLines],
  );

  const catalogLines = useMemo<CatalogLine[]>(
    () =>
      initialLines.map((line) => ({
        ...line,
        catalogSellingPricePerUnit: line.sellingPricePerUnit,
      })),
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

  const lines = useMemo(() => {
    const discount = parseDiscount(discountPercent);
    return catalogLines.map((catalog) => {
      const manual = manualOverrides.get(catalog.orderItemId);
      if (manual != null) {
        return lineFromCatalog(catalog, manual);
      }
      const discountedUnit =
        catalog.catalogSellingPricePerUnit * (1 - discount / 100);
      return lineFromCatalog(catalog, discountedUnit);
    });
  }, [catalogLines, discountPercent, manualOverrides]);

  const totalValue = useMemo(
    () => lines.reduce((sum, line) => sum + line.totalSellingValue, 0),
    [lines],
  );
  const totalQty = useMemo(
    () => lines.reduce((sum, line) => sum + line.totalQuantity, 0),
    [lines],
  );

  function updatePrice(orderItemId: string, raw: string) {
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0) return;
    setManualOverrides((prev) => {
      const next = new Map(prev);
      next.set(orderItemId, price);
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
          manualSellingPricePerUnit: manualOverrides.has(line.orderItemId)
            ? manualOverrides.get(line.orderItemId)
            : null,
          discountPercent: discount,
        })),
      ),
    );
    if (proposalLabel.trim()) formData.set("label", proposalLabel.trim());
    if (proposalComment.trim()) formData.set("comment", proposalComment.trim());

    startTransition(async () => {
      const result = await saveProposalAction(formData);
      if (!result.ok) {
        if (result.error === "ORDER_LOCKED") {
          setError("Замовлення заблоковано для редагування.");
          return;
        }
        if (result.error === "EMPTY_ORDER_NOT_ALLOWED") {
          setError("Порожнє замовлення можна зберігати лише на Чернетці або Розрахунку.");
          return;
        }
        if (result.error === "USE_NEW_PROPOSAL") {
          setError("Замовлення вже погоджене. Натисніть «Нова пропозиція».");
          return;
        }
        setError("Не вдалося зберегти пропозицію. Перевірте склад усіх позицій.");
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
        description="Комерційна ціна з прайсу (+ брендування). Собівартість лишається для внутрішнього планування."
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

          <div className="overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-border)]">
            <table className="erp-table w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-table-section-border)]">
                  <th className="px-3 py-2 text-left">Виріб</th>
                  <th className="px-3 py-2 text-right">К-сть</th>
                  <th className="px-3 py-2 text-right">Собівартість/од.</th>
                  <th className="px-3 py-2 text-right">Ціна для клієнта/од.</th>
                  <th className="px-3 py-2 text-right">Сума рядка</th>
                  <th className="px-3 py-2 text-right">Маржа</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.orderItemId} className="border-b border-[var(--color-divider)]">
                    <td className="px-3 py-2 font-medium">
                      {line.nameUk}
                      {line.fromPriceList ? (
                        <span className="type-caption ml-1 text-[var(--color-primary-700)]">прайс</span>
                      ) : null}
                      {manualOverrides.has(line.orderItemId) ? (
                        <span className="type-caption ml-1 text-[var(--color-text-secondary)]">ручна</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular">{line.totalQuantity} шт</td>
                    <td className="px-3 py-2 text-right tabular text-[var(--color-text-secondary)]">
                      {formatMoneyUah(line.costPerUnit)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.sellingPricePerUnit.toFixed(2)}
                        onChange={(event) => updatePrice(line.orderItemId, event.target.value)}
                        className="h-8 w-[7rem] rounded-[6px] border border-[var(--color-border)] px-2 text-right tabular outline-none focus:border-[var(--color-primary-500)]"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular">
                      {formatMoneyUah(line.totalSellingValue)}
                    </td>
                    <td className="px-3 py-2 text-right tabular">
                      {line.marginPercent.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="px-3 py-2.5 text-right font-semibold">
                    Разом до сплати
                  </td>
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
