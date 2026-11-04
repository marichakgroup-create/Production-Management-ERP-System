"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Overlay";
import { useAppDialog } from "@/components/ui/ConfirmDialog";
import { SoftBusy } from "@/components/ui/SoftBusy";
import {
  Table,
  TableCard,
  TableToolbar,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/Table";
import { SizeGuideInline } from "@/components/size-charts/SizeGuideHelp";
import {
  saveSizeChartVariantAction,
  saveVariantSizesAction,
  archiveSizeChartVariantAction,
} from "@/server/domains/size-charts/actions";
import { getSizeGuideForVariant } from "@/server/domains/size-charts/size-instructions";
import { cn } from "@/lib/utils";

export type SizeChartSizeRow = {
  id?: string;
  code: string;
  nameUk: string;
  descriptionUk: string;
  sortOrder: number;
  status?: string;
};

export type SizeChartVariantRow = {
  id: string;
  code: string;
  nameUk: string;
  description: string | null;
  sortOrder: number;
  status: string;
  sizes: SizeChartSizeRow[];
  productCount: number;
};

type PanelTab = "sizes" | "hint";

function emptySize(sortOrder: number): SizeChartSizeRow {
  return { code: "", nameUk: "", descriptionUk: "", sortOrder };
}

function sizesFromVariant(row: SizeChartVariantRow): SizeChartSizeRow[] {
  return row.sizes
    .filter((size) => size.status !== "ARCHIVED")
    .map((size) => ({
      id: size.id,
      code: size.code,
      nameUk: size.nameUk,
      descriptionUk: size.descriptionUk ?? "",
      sortOrder: size.sortOrder,
    }));
}

export function SizeChartsAdminPanel({
  variants: initialVariants,
}: {
  variants: SizeChartVariantRow[];
}) {
  const router = useRouter();
  const dialog = useAppDialog();
  const [pending, startTransition] = useTransition();
  const [variants, setVariants] = useState(initialVariants);
  const [selectedId, setSelectedId] = useState(initialVariants[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** «Розміри» = реальні розміри для виробу/замовлення; «Підказка» = обхвати / довідка. */
  const [panel, setPanel] = useState<PanelTab>("sizes");
  const [createOpen, setCreateOpen] = useState(false);
  const [variantDraft, setVariantDraft] = useState({
    nameUk: "",
    code: "",
  });

  const selected = useMemo(
    () => variants.find((row) => row.id === selectedId) ?? null,
    [variants, selectedId],
  );

  const hasHint = Boolean(selected && getSizeGuideForVariant(selected.code));

  const [sizeDrafts, setSizeDrafts] = useState<SizeChartSizeRow[]>(() =>
    initialVariants[0] ? sizesFromVariant(initialVariants[0]) : [],
  );

  function selectVariant(row: SizeChartVariantRow, tab: PanelTab = "sizes") {
    setSelectedId(row.id);
    setPanel(tab);
    setSizeDrafts(sizesFromVariant(row));
    setError(null);
    setMessage(null);
  }

  useMemo(() => {
    setVariants(initialVariants);
    const stillThere = initialVariants.some((row) => row.id === selectedId);
    if (!stillThere && initialVariants[0]) {
      selectVariant(initialVariants[0], "sizes");
      return;
    }
    const current = initialVariants.find((row) => row.id === selectedId);
    if (current) setSizeDrafts(sizesFromVariant(current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVariants]);

  function addVariant() {
    setError(null);
    if (!variantDraft.nameUk.trim()) {
      setError("Вкажіть назву варіанту сітки.");
      return;
    }
    const formData = new FormData();
    formData.set("nameUk", variantDraft.nameUk.trim());
    if (variantDraft.code.trim()) formData.set("code", variantDraft.code.trim());
    formData.set("sortOrder", String(variants.length + 1));
    startTransition(async () => {
      const result = await saveSizeChartVariantAction(formData);
      if (!result.ok) {
        setError(
          result.error === "DUPLICATE_CODE"
            ? "Такий код варіанту вже є."
            : result.error === "NAME_REQUIRED"
              ? "Вкажіть назву."
              : "Не вдалося зберегти варіант.",
        );
        return;
      }
      setVariantDraft({ nameUk: "", code: "" });
      setCreateOpen(false);
      setSelectedId(result.id);
      setPanel("sizes");
      setSizeDrafts([]);
      setMessage("Варіант створено — додайте реальні розміри і збережіть.");
      router.refresh();
    });
  }

  function saveSizes() {
    if (!selected) return;
    setError(null);
    const formData = new FormData();
    formData.set("variantId", selected.id);
    formData.set(
      "sizesJson",
      JSON.stringify(
        sizeDrafts
          .filter((row) => row.code.trim())
          .map((row, index) => ({
            code: row.code.trim(),
            nameUk: row.nameUk.trim() || row.code.trim(),
            // Keep existing hint text if any; sizes editor no longer edits it.
            descriptionUk: row.descriptionUk.trim() || null,
            sortOrder: index + 1,
          })),
      ),
    );
    startTransition(async () => {
      const result = await saveVariantSizesAction(formData);
      if (!result.ok) {
        setError(
          result.error === "DUPLICATE_CODE"
            ? "Коди розмірів у варіанті мають бути унікальні."
            : "Не вдалося зберегти розміри.",
        );
        return;
      }
      setMessage("Розміри збережено.");
      router.refresh();
    });
  }

  async function archiveVariant(row: SizeChartVariantRow) {
    setError(null);
    setMessage(null);
    if (row.productCount > 0) {
      setError(
        `«${row.nameUk}» використовується в ${row.productCount} виробах — спочатку змініть сітку на виробах.`,
      );
      return;
    }
    const ok = await dialog.ask({
      title: `Видалити сітку «${row.nameUk}»?`,
      message: "Варіант зникне з довідника розмірів.",
      confirmLabel: "Видалити",
      danger: true,
    });
    if (!ok) return;
    const formData = new FormData();
    formData.set("id", row.id);
    startTransition(async () => {
      const result = await archiveSizeChartVariantAction(formData);
      if (!result.ok) {
        setError(
          result.error === "VARIANT_IN_USE"
            ? "Сітку не можна видалити — вона використовується у виробах."
            : "Не вдалося видалити сітку.",
        );
        return;
      }
      setMessage(`«${row.nameUk}» видалено з довідника.`);
      if (selectedId === row.id) {
        const next = variants.find((item) => item.id !== row.id && item.status === "ACTIVE");
        if (next) selectVariant(next);
        else {
          setSelectedId("");
          setSizeDrafts([]);
        }
      }
      router.refresh();
    });
  }

  const activeVariants = variants.filter((row) => row.status === "ACTIVE");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)] lg:items-start">
      {dialog.view}
      <TableCard className="overflow-visible">
        <TableToolbar
          left={<span className="type-label">Варіанти сітки</span>}
          right={
            <Button type="button" size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
              + Новий
            </Button>
          }
        />
        <ul className="max-h-[min(70vh,36rem)] overflow-y-auto p-1.5">
          {activeVariants.map((row) => {
            const active = row.id === selectedId;
            const count = row.sizes.filter((s) => s.status !== "ARCHIVED").length;
            return (
              <li key={row.id} className="group flex items-stretch gap-0.5">
                <button
                  type="button"
                  onClick={() => selectVariant(row, "sizes")}
                  className={cn(
                    "flex min-w-0 flex-1 items-baseline justify-between gap-2 rounded-[6px] px-2 py-1.5 text-left transition-colors",
                    active
                      ? "bg-[var(--color-tint-sage)] text-[var(--color-primary-800)]"
                      : "hover:bg-[var(--color-surface-subtle)]",
                  )}
                >
                  <span className="truncate text-[13px] font-medium leading-snug">{row.nameUk}</span>
                  <span className="shrink-0 type-caption tabular-nums text-[var(--color-text-quiet)]">
                    {count}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={pending}
                  title={
                    row.productCount > 0
                      ? `Використовується в ${row.productCount} виробах`
                      : "Видалити з довідника"
                  }
                  aria-label={`Видалити ${row.nameUk}`}
                  onClick={() => archiveVariant(row)}
                  className={cn(
                    "shrink-0 rounded-[6px] px-1.5 text-[14px] leading-none text-[var(--color-text-quiet)] opacity-0 transition-opacity hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-danger)] group-hover:opacity-100 focus-visible:opacity-100",
                    active && "opacity-100",
                  )}
                >
                  ×
                </button>
              </li>
            );
          })}
          {activeVariants.length === 0 ? (
            <li className="px-2 py-3 type-caption">Ще немає варіантів.</li>
          ) : null}
        </ul>
      </TableCard>

      <SoftBusy busy={pending} className="min-w-0">
        <TableCard>
          {!selected ? (
            <div className="px-3.5 py-8 text-center type-caption">
              Оберіть варіант сітки зліва.
            </div>
          ) : (
            <>
              <TableToolbar
                left={
                  <p className="truncate text-[15px] font-semibold text-[var(--color-text)]">
                    {selected.nameUk}
                  </p>
                }
                right={
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="inline-flex rounded-[8px] border border-[var(--color-border)] p-0.5">
                      <button
                        type="button"
                        onClick={() => setPanel("sizes")}
                        className={cn(
                          "rounded-[6px] px-2.5 py-1 text-[12.5px] font-medium",
                          panel === "sizes"
                            ? "bg-[var(--color-tint-sage)] text-[var(--color-primary-800)]"
                            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
                        )}
                      >
                        Розміри
                      </button>
                      <button
                        type="button"
                        onClick={() => setPanel("hint")}
                        className={cn(
                          "rounded-[6px] px-2.5 py-1 text-[12.5px] font-medium",
                          panel === "hint"
                            ? "bg-[var(--color-tint-sage)] text-[var(--color-primary-800)]"
                            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
                        )}
                      >
                        Підказка
                      </button>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => archiveVariant(selected)}
                    >
                      Видалити
                    </Button>
                  </div>
                }
              />

              <div className={cn(panel === "sizes" ? "p-0" : "space-y-3 p-3.5")}>
                {error ? (
                  <div className={panel === "sizes" ? "px-3.5 pt-2.5" : undefined}>
                    <Banner tone="danger">{error}</Banner>
                  </div>
                ) : null}
                {message ? (
                  <div className={panel === "sizes" ? "px-3.5 pt-2.5" : undefined}>
                    <Banner tone="success">{message}</Banner>
                  </div>
                ) : null}

                {panel === "sizes" ? (
                  <div>
                    <Table>
                      <THead>
                        <TH className="w-[7rem] !py-1.5">Код</TH>
                        <TH className="!py-1.5">Назва</TH>
                        <TH className="w-9 !py-1.5" />
                      </THead>
                      <TBody>
                        {sizeDrafts.length === 0 ? (
                          <TR>
                            <TD colSpan={3} className="!py-4 text-center type-caption">
                              Немає розмірів — натисніть «+ Розмір».
                            </TD>
                          </TR>
                        ) : (
                          sizeDrafts.map((row, index) => (
                            <TR key={`${row.id ?? "new"}-${index}`}>
                              <TD className="!py-0.5">
                                <input
                                  className="h-7 w-full rounded-[5px] border border-transparent bg-transparent px-1.5 text-[13px] outline-none hover:border-[var(--color-border)] focus:border-[var(--color-primary-500)] focus:bg-[var(--color-surface)]"
                                  value={row.code}
                                  placeholder="S"
                                  onChange={(event) => {
                                    const code = event.target.value;
                                    setSizeDrafts((prev) => {
                                      const next = [...prev];
                                      next[index] = {
                                        ...row,
                                        code,
                                        nameUk: row.nameUk || code,
                                      };
                                      return next;
                                    });
                                  }}
                                />
                              </TD>
                              <TD className="!py-0.5">
                                <input
                                  className="h-7 w-full rounded-[5px] border border-transparent bg-transparent px-1.5 text-[13px] outline-none hover:border-[var(--color-border)] focus:border-[var(--color-primary-500)] focus:bg-[var(--color-surface)]"
                                  value={row.nameUk}
                                  placeholder="S · 42–44"
                                  onChange={(event) => {
                                    const nameUk = event.target.value;
                                    setSizeDrafts((prev) => {
                                      const next = [...prev];
                                      next[index] = { ...row, nameUk };
                                      return next;
                                    });
                                  }}
                                />
                              </TD>
                              <TD className="!py-0.5 text-center">
                                <button
                                  type="button"
                                  className="text-[12px] leading-none text-[var(--color-text-quiet)] hover:text-[var(--color-danger)]"
                                  onClick={() =>
                                    setSizeDrafts((prev) =>
                                      prev.filter((_, i) => i !== index),
                                    )
                                  }
                                  aria-label="Прибрати розмір"
                                >
                                  ×
                                </button>
                              </TD>
                            </TR>
                          ))
                        )}
                      </TBody>
                    </Table>
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--color-border)] px-3 py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() =>
                          setSizeDrafts((prev) => [...prev, emptySize(prev.length + 1)])
                        }
                      >
                        + Розмір
                      </Button>
                      <Button type="button" size="sm" disabled={pending} onClick={saveSizes}>
                        {pending ? "Збереження…" : "Зберегти"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="type-caption">
                      Підказка для підбору (обхвати, зріст) — не розміри сітки.
                    </p>
                    {hasHint ? (
                      <SizeGuideInline variantCode={selected.code} />
                    ) : (
                      <div className="rounded-[8px] border border-dashed border-[var(--color-border)] px-3 py-4 text-center type-caption">
                        Немає таблиці-підказки. Розміри — у вкладці «Розміри».
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </TableCard>
      </SoftBusy>

      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setError(null);
        }}
        title="Новий варіант сітки"
        description="Після створення відкриється вкладка «Розміри» — додайте коди/назви і збережіть."
        width="sm"
        footer={
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setCreateOpen(false)}
            >
              Скасувати
            </Button>
            <Button type="button" size="sm" disabled={pending} onClick={addVariant}>
              {pending ? "Збереження…" : "Створити"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && createOpen ? <Banner tone="danger">{error}</Banner> : null}
          <Input
            label="Назва"
            value={variantDraft.nameUk}
            onChange={(event) =>
              setVariantDraft((prev) => ({ ...prev, nameUk: event.target.value }))
            }
            placeholder="Напр. Жіноча EU"
            autoFocus
          />
          <Input
            label="Код"
            optional
            value={variantDraft.code}
            onChange={(event) =>
              setVariantDraft((prev) => ({ ...prev, code: event.target.value }))
            }
            placeholder="Авто з назви"
          />
        </div>
      </Modal>
    </div>
  );
}
