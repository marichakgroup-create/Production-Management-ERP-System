"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, FormGroup } from "@/components/ui/Field";
import { Banner } from "@/components/ui/Banner";
import { EmptyState } from "@/components/ui/Page";
import { SplitWorkspace } from "@/components/layout/SplitWorkspace";
import { ClientCreatePanel } from "@/components/clients/ClientCreateForm";
import { ProductCreatePanel } from "@/components/products/ProductCreatePanel";
import {
  ProductCatalogPanel,
  ProductThumb,
  type CatalogProduct,
  type DraftComposition,
} from "@/components/orders/ProductCatalogPanel";
import {
  cloneComposition,
  DraftCompositionEditor,
  type DecorationCatalogOption,
  type MaterialCatalogOption,
  type OperationCatalogOption,
} from "@/components/orders/DraftCompositionEditor";
import { syncDraftMaterialPrices, isPackagingSku } from "@/lib/draft-composition";
import type { MaterialCostVatMode } from "@/lib/fabric-pricing";
import {
  IconAlert,
  IconCheckCircle,
  IconCircle,
  IconGarment,
  IconTrash,
} from "@/components/ui/Icons";
import { createOrderAction } from "@/server/domains/orders/actions";
import { cn, formatMoneyUah } from "@/lib/utils";
import { OrderDetailSection } from "@/components/orders/OrderWorkspaceLayout";
import { IconClients } from "@/components/ui/Icons";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";
import { useUnsavedCloseGuard } from "@/hooks/useUnsavedCloseGuard";

type ClientOption = {
  id: string;
  label: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
};
type SizeOption = { id: string; label: string; code?: string; variantId?: string };

type DraftLine = {
  key: string;
  productId: string;
  label: string;
  quantities: Record<string, number>;
  sizes: Array<{ code: string; nameUk: string }>;
  comment: string;
  materialsCount: number;
  operationsCount: number;
  composition: DraftComposition;
};

function priceForQuantity(product: CatalogProduct | undefined, quantity: number) {
  if (!product || product.priceTiers.length === 0 || quantity <= 0) return null;
  const sorted = [...product.priceTiers].sort((a, b) => a.qty - b.qty);
  const match = [...sorted].reverse().find((tier) => quantity >= tier.qty);
  return (match ?? sorted[0]).price;
}

function lineTotal(line: DraftLine, products: CatalogProduct[]) {
  const product = products.find((row) => row.id === line.productId);
  const qty = line.sizes.reduce((sum, size) => sum + (line.quantities[size.code] || 0), 0);
  const unit = priceForQuantity(product, qty);
  return { qty, unit, sum: unit != null ? unit * qty : null };
}

function newKey() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function OrderCreateForm({
  clients: initialClients,
  products: initialProducts,
  sizeOptions,
  sizeVariants = [],
  unitOptions = [],
  materialCatalog: initialMaterialCatalog,
  operationCatalog: initialOperationCatalog,
  decorationCatalog: initialDecorationCatalog,
  companyCostMode = "NET",
  fabricGlobals,
  showCosts = false,
  initialClientId,
  initialProductId,
}: {
  clients: ClientOption[];
  products: CatalogProduct[];
  sizeOptions: SizeOption[];
  sizeVariants?: Array<{ id: string; nameUk: string }>;
  unitOptions?: Array<{ id: string; label: string }>;
  materialCatalog: MaterialCatalogOption[];
  operationCatalog: OperationCatalogOption[];
  decorationCatalog: DecorationCatalogOption[];
  companyCostMode?: MaterialCostVatMode;
  fabricGlobals?: { usdUahRate: number; fabricCargoUsdPerKg: number };
  /** Admin: money columns on draft BOM. Color / ПДВ still chosen inside the order. */
  showCosts?: boolean;
  initialClientId?: string;
  initialProductId?: string;
}) {
  const router = useRouter();
  const [clients, setClients] = useState(initialClients);
  const [products, setProducts] = useState(initialProducts);
  const [materialCatalog, setMaterialCatalog] = useState(initialMaterialCatalog);
  const [operationCatalog, setOperationCatalog] = useState(initialOperationCatalog);
  const [decorationCatalog, setDecorationCatalog] = useState(initialDecorationCatalog);
  const [clientId, setClientId] = useState(initialClientId || "");
  const [deadline, setDeadline] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [stagingProductId, setStagingProductId] = useState(initialProductId || "");
  const [stagingComposition, setStagingComposition] = useState<DraftComposition | null>(() => {
    if (!initialProductId) return null;
    const product = initialProducts.find((row) => row.id === initialProductId);
    return product
      ? syncDraftMaterialPrices(
          cloneComposition(product, initialMaterialCatalog, companyCostMode),
          {},
          companyCostMode,
        )
      : null;
  });
  const [stagingQty, setStagingQty] = useState<Record<string, number>>({});
  const [stagingComment, setStagingComment] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [switchProductOpen, setSwitchProductOpen] = useState(false);
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);

  const stagingProduct = useMemo(
    () => products.find((product) => product.id === stagingProductId),
    [products, stagingProductId],
  );
  const selectedClient = clients.find((client) => client.id === clientId);

  const stagingSizes = stagingProduct?.sizes.length
    ? stagingProduct.sizes
    : [{ code: "ONE", nameUk: "Без розміру" }];

  const stagingTotalQty =
    stagingSizes.reduce((sum, size) => sum + (stagingQty[size.code] || 0), 0) +
    (stagingQty.ONE && !stagingSizes.some((size) => size.code === "ONE")
      ? stagingQty.ONE
      : 0);
  const stagingUsesTotalOnly =
    (stagingQty.ONE ?? 0) > 0 &&
    stagingSizes.every((size) => size.code === "ONE" || !(stagingQty[size.code] > 0));
  const stagingEffectiveSizes = stagingUsesTotalOnly
    ? [{ code: "ONE", nameUk: "Тираж (орієнтовно)" }]
    : stagingSizes;
  const stagingTotal = stagingUsesTotalOnly
    ? stagingQty.ONE || 0
    : stagingTotalQty;
  const stagingReady = Boolean(
    stagingProductId && stagingComposition && stagingTotal > 0,
  );

  const editingLine = editingKey ? lines.find((row) => row.key === editingKey) : null;
  const stagingDirty = useMemo(() => {
    if (!stagingReady || !stagingComposition) return false;
    if (!editingLine) return true;
    const qtyKeys = new Set([
      ...Object.keys(stagingQty),
      ...Object.keys(editingLine.quantities),
    ]);
    for (const key of qtyKeys) {
      if ((stagingQty[key] || 0) !== (editingLine.quantities[key] || 0)) return true;
    }
    if (stagingComment.trim() !== editingLine.comment) return true;
    if (stagingComposition.materials.length !== editingLine.composition.materials.length) {
      return true;
    }
    if (stagingComposition.operations.length !== editingLine.composition.operations.length) {
      return true;
    }
    for (let i = 0; i < stagingComposition.materials.length; i++) {
      const a = stagingComposition.materials[i]!;
      const b = editingLine.composition.materials[i]!;
      if (
        a.materialId !== b.materialId ||
        a.consumption !== b.consumption ||
        a.waste !== b.waste
      ) {
        return true;
      }
    }
    return false;
  }, [
    stagingReady,
    stagingComposition,
    stagingQty,
    stagingComment,
    editingLine,
  ]);

  const confirmDisabled = !stagingReady || (Boolean(editingKey) && !stagingDirty);
  const confirmLabel = !stagingReady
    ? editingKey
      ? "Зберегти зміни"
      : "Погодити і додати"
    : editingKey
      ? stagingDirty
        ? "Зберегти зміни"
        : "Збережено в списку"
      : "Погодити і додати";

  const linesQty = lines.reduce(
    (sum, line) =>
      sum +
      line.sizes.reduce((s, size) => s + (line.quantities[size.code] || 0), 0) +
      (line.quantities.ONE && !line.sizes.some((size) => size.code === "ONE")
        ? line.quantities.ONE
        : 0),
    0,
  );
  const estimate = showCosts
    ? lines.reduce((sum, line) => {
        const { sum: lineSum } = lineTotal(line, products);
        return sum + (lineSum ?? 0);
      }, 0)
    : 0;

  const readyToSubmit = Boolean(clientId && lines.length > 0);

  const formDirty =
    lines.length > 0 ||
    Boolean(clientId) ||
    Boolean(deadline) ||
    Boolean(stagingProductId) ||
    Object.values(stagingQty).some((qty) => qty > 0) ||
    Boolean(stagingComment.trim());

  const leaveToOrders = useCallback(() => {
    router.push("/orders");
  }, [router]);

  const { leaveOpen, requestClose: requestLeave, stay, discard } = useUnsavedCloseGuard({
    dirty: formDirty,
    pending,
    onDiscard: leaveToOrders,
  });

  function clearStaging() {
    setStagingProductId("");
    setStagingComposition(null);
    setStagingQty({});
    setStagingComment("");
    setEditingKey(null);
  }

  /** Keep an order line open in the left workspace (view / edit). */
  function focusLine(line: DraftLine) {
    setEditingKey(line.key);
    setStagingProductId(line.productId);
    setStagingComposition({
      materials: line.composition.materials.map((row) => ({ ...row })),
      operations: line.composition.operations.map((row) => ({ ...row })),
      decorations: line.composition.decorations.map((row) => ({ ...row })),
    });
    setStagingQty({ ...line.quantities });
    setStagingComment(line.comment);
  }

  function cancelStaging() {
    if (editingKey) {
      const line = lines.find((row) => row.key === editingKey);
      if (line) {
        focusLine(line);
        return;
      }
    }
    const last = lines[lines.length - 1];
    if (last) focusLine(last);
    else clearStaging();
  }

  function applySelectProduct(id: string) {
    const product = products.find((row) => row.id === id);
    if (!product) return;
    // New position from catalog — leave confirmed lines in the table as-is.
    setStagingProductId(id);
    setStagingComposition(
      syncDraftMaterialPrices(
        cloneComposition(product, materialCatalog, companyCostMode),
        {},
        companyCostMode,
      ),
    );
    setStagingQty({});
    setStagingComment("");
    setEditingKey(null);
  }

  function selectProduct(id: string) {
    if (id === stagingProductId) return;
    if (stagingDirty && id !== stagingProductId) {
      setPendingProductId(id);
      setSwitchProductOpen(true);
      return;
    }
    applySelectProduct(id);
  }

  function buildStagingPayload(key: string): DraftLine | null {
    if (!stagingProduct || !stagingComposition || stagingTotal <= 0) return null;
    return {
      key,
      productId: stagingProduct.id,
      label: stagingProduct.label,
      quantities: { ...stagingQty },
      sizes: stagingEffectiveSizes.map((size) => ({ ...size })),
      comment: stagingComment.trim(),
      materialsCount: stagingComposition.materials.length,
      operationsCount: stagingComposition.operations.length,
      composition: {
        materials: stagingComposition.materials.map((row) => ({ ...row })),
        operations: stagingComposition.operations.map((row) => ({ ...row })),
        decorations: stagingComposition.decorations.map((row) => ({ ...row })),
      },
    };
  }

  function addOrSaveStaging() {
    const key = editingKey ?? newKey();
    const payload = buildStagingPayload(key);
    if (!payload) return;
    setLines((prev) => {
      if (editingKey) return prev.map((line) => (line.key === editingKey ? payload : line));
      return [...prev, payload];
    });
    // Keep composition on the left; catalog stays open to add another product.
    focusLine(payload);
  }

  function editLine(line: DraftLine) {
    focusLine(line);
  }

  function removeLine(key: string) {
    const next = lines.filter((line) => line.key !== key);
    setLines(next);
    if (editingKey === key) {
      const fallback = next[next.length - 1];
      if (fallback) focusLine(fallback);
      else clearStaging();
    }
  }

  function onSubmit(formData: FormData) {
    setError(null);
    if (!readyToSubmit) {
      setError("Додайте клієнта і хоча б одну позицію в список замовлення.");
      return;
    }
    // Block only an unfinished *new* position; open edits of an existing line are flushed below.
    if (!editingKey && stagingProductId && stagingTotal > 0) {
      setError("Спочатку погодьте позицію або скасуйте підготовку.");
      return;
    }

    let linesForSubmit = lines;
    if (editingKey) {
      const payload = buildStagingPayload(editingKey);
      if (payload) {
        linesForSubmit = lines.map((line) => (line.key === editingKey ? payload : line));
        setLines(linesForSubmit);
      }
    }

    const itemsJson = JSON.stringify(
      linesForSubmit.map((line) => ({
        productId: line.productId,
        comment: line.comment || null,
        sizeQuantities: line.sizes.map((size) => ({
          sizeCode: size.code,
          sizeNameUk: size.nameUk,
          quantity: line.quantities[size.code] || 0,
        })),
        composition: {
          materials: line.composition.materials.map((row) => ({
            materialId: row.materialId,
            consumptionPerUnit: row.consumption,
            wastePercent: row.waste,
            sizeCodes: row.sizeCodes ?? null,
            sizeConsumption: row.sizeConsumption,
            purchasePrice: row.price,
            supplierId: row.supplierId?.trim() || null,
            deliveryType: row.deliveryType || null,
            colorSnapshot: isPackagingSku(row)
              ? null
              : row.lineColor?.trim() || row.colorSnapshot?.trim() || null,
            cargoUsdPerKg: row.cargoUsdPerKg ?? null,
            usdUahRate: row.usdUahRate ?? null,
            fabricDeliveryManual: Boolean(row.fabricDeliveryManual),
            fabricDeliveryAmount:
              row.fabricDeliveryManual && row.fabricDeliveryAmount != null
                ? Number(row.fabricDeliveryAmount)
                : null,
          })),
          operations: line.composition.operations.map((row) => ({
            operationId: row.operationId,
            sizeCodes: row.sizeCodes ?? null,
          })),
          decorations: [],
        },
      })),
    );
    formData.set("itemsJson", itemsJson);
    formData.delete("productId");

    startTransition(async () => {
      try {
        const result = await createOrderAction(formData);
        if (!result.ok) {
          setError(
            result.error === "QUANTITY_REQUIRED"
              ? "У кожної позиції має бути кількість."
              : result.error === "ITEMS_REQUIRED"
                ? "Додайте хоча б одну позицію до списку."
                : result.error === "PRODUCT_ARCHIVED" || result.error === "PRODUCT_NOT_FOUND"
                  ? "Обраний виріб недоступний — оберіть інший з каталогу."
                  : result.error === "CREATE_FAILED"
                    ? "Не вдалося зберегти замовлення. Перевірте матеріали й розміри та спробуйте ще раз."
                    : "Перевірте обовʼязкові поля — замовлення не створено.",
          );
          return;
        }
        if (!result.orderId) {
          setError("Замовлення створено, але не отримано посилання. Відкрийте список замовлень.");
          return;
        }
        router.push(`/orders/${result.orderId}`);
        router.refresh();
      } catch (error) {
        console.error("[OrderCreateForm] create failed:", error);
        setError("Не вдалося створити замовлення. Спробуйте ще раз або оновіть сторінку.");
      }
    });
  }

  return (
    <form id="order-create-form" action={onSubmit} className="space-y-4 pb-16">
      <SplitWorkspace
        className="xl:grid-cols-[minmax(0,1fr)_minmax(200px,232px)]"
        left={
          <>
            <OrderDetailSection icon={<IconClients size={16} />} title="Замовник і умови">
            <div className="space-y-4">
              <FormGroup
                label="Клієнт"
                columns={1}
                action={
                  <ClientCreatePanel
                    variant="secondary"
                    size="sm"
                    triggerLabel="Новий клієнт"
                    onCreated={(client) => {
                      setClients((prev) => {
                        const next = {
                          id: client.id,
                          label: client.companyName,
                          contactPerson: client.contactPerson ?? null,
                          phone: client.phone ?? null,
                          email: client.email ?? null,
                        };
                        return prev.some((row) => row.id === client.id)
                          ? prev.map((row) => (row.id === client.id ? next : row))
                          : [...prev, next];
                      });
                      setClientId(client.id);
                    }}
                  />
                }
              >
                <Select
                  name="clientId"
                  label="Замовник"
                  required
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                >
                  <option value="">Оберіть клієнта…</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.label}
                    </option>
                  ))}
                </Select>
              </FormGroup>

              {selectedClient ? (
                <div className="rounded-[10px] border border-[var(--color-divider)] bg-[var(--color-bg)]/40 px-3.5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-quiet)]">
                    Дані клієнта
                  </p>
                  <p className="mt-1 text-[14px] font-semibold text-[var(--color-text-primary)]">
                    {selectedClient.label}
                  </p>
                  <dl className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-3">
                    <div className="min-w-0">
                      <dt className="type-caption">Контакт</dt>
                      <dd className="truncate text-[13px] text-[var(--color-text-secondary)]">
                        {selectedClient.contactPerson?.trim() || "—"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="type-caption">Телефон</dt>
                      <dd className="truncate text-[13px] text-[var(--color-text-secondary)]">
                        {selectedClient.phone?.trim() || "—"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="type-caption">Email</dt>
                      <dd className="truncate text-[13px] text-[var(--color-text-secondary)]">
                        {selectedClient.email?.trim() || "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <p className="type-caption">
                  Після вибору або створення клієнта тут зʼявляться контактні дані.
                </p>
              )}

              <FormGroup label="Терміни" columns={2}>
                <Input name="title" label="Назва запиту" placeholder="Необовʼязково" />
                <Input
                  name="deadline"
                  label="Дедлайн"
                  type="date"
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                />
              </FormGroup>
            </div>
            </OrderDetailSection>

            {stagingProduct && stagingComposition ? (
              <DraftCompositionEditor
                product={stagingProduct}
                composition={stagingComposition}
                quantities={stagingQty}
                comment={stagingComment}
                editing={Boolean(editingKey)}
                inList={Boolean(editingKey) && !stagingDirty}
                confirmLabel={confirmLabel}
                materialOptions={materialCatalog}
                operationOptions={operationCatalog}
                decorationOptions={decorationCatalog}
                unitOptions={unitOptions}
                companyCostMode={companyCostMode}
                fabricGlobals={fabricGlobals}
                enableLinePricingControls={false}
                showSubtotals={showCosts}
                onMaterialCatalogAdd={(option) =>
                  setMaterialCatalog((prev) =>
                    prev.some((row) => row.id === option.id) ? prev : [...prev, option],
                  )
                }
                onMaterialCatalogColorsChange={(materialId, colors) =>
                  setMaterialCatalog((prev) =>
                    prev.map((row) =>
                      row.id === materialId ? { ...row, availableColors: colors } : row,
                    ),
                  )
                }
                onOperationCatalogAdd={(option) =>
                  setOperationCatalog((prev) =>
                    prev.some((row) => row.id === option.id) ? prev : [...prev, option],
                  )
                }
                onDecorationCatalogAdd={(option) =>
                  setDecorationCatalog((prev) =>
                    prev.some((row) => row.id === option.id) ? prev : [...prev, option],
                  )
                }
                onQuantitiesChange={(code, quantity) =>
                  setStagingQty((prev) => ({ ...prev, [code]: quantity }))
                }
                onCommentChange={setStagingComment}
                onCompositionChange={setStagingComposition}
                onCancel={cancelStaging}
                onConfirm={addOrSaveStaging}
                confirmDisabled={confirmDisabled}
              />
            ) : (
              <div className="rounded-[var(--radius-surface)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
                <EmptyState
                  size="lg"
                  icon={<IconGarment size={28} />}
                  title={
                    lines.length > 0
                      ? "Оберіть виріб у каталозі або позицію в списку"
                      : "Спочатку виберіть виріб"
                  }
                  description={
                    lines.length > 0
                      ? "Натисніть «Редагувати» у списку або додайте новий виріб з панелі справа."
                      : "Після вибору тут зʼявляться матеріали, операції та попередня калькуляція."
                  }
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="type-subsection">Позиції замовлення</h2>
                <span className="type-caption tabular">{lines.length} у списку</span>
              </div>

              {lines.length === 0 ? (
                <div className="rounded-[var(--radius-surface)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
                  <EmptyState
                    size="sm"
                    icon={<IconGarment size={22} />}
                    title="Позицій ще немає"
                    description="Оберіть виріб у каталозі, вкажіть тираж і додайте його в таблицю замовлення."
                  />
                </div>
              ) : (
                <div className="overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)]">
                  <table className="erp-table w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-[var(--color-table-section-border)]">
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Виріб</th>
                        <th className="px-3 py-2 text-right">К-сть</th>
                        <th className="px-3 py-2 text-left">Склад</th>
                        {showCosts ? (
                          <th className="px-3 py-2 text-right">Орієнтир</th>
                        ) : null}
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, index) => {
                        const { qty, unit, sum } = lineTotal(line, products);
                        const editing = editingKey === line.key;
                        return (
                          <tr
                            key={line.key}
                            className={cn(
                              "border-b border-[var(--color-divider)] last:border-0",
                              editing
                                ? "bg-[var(--color-tint-sage)]"
                                : "hover:bg-[var(--color-surface-hover)]",
                            )}
                          >
                            <td className="px-3 py-2 tabular text-[var(--color-text-tertiary)]">
                              {index + 1}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex min-w-0 items-start gap-2.5">
                                <ProductThumb
                                  imageUrl={
                                    products.find((row) => row.id === line.productId)?.imageUrl
                                  }
                                  label={line.label}
                                  active={editing}
                                  size="sm"
                                />
                                <div className="min-w-0">
                                  <p className="font-medium">{line.label}</p>
                                  {line.comment ? (
                                    <p className="type-caption">{line.comment}</p>
                                  ) : null}
                                  {editing ? (
                                    <p className="type-caption text-[var(--color-primary-700)]">
                                      Редагується зліва
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right tabular">{qty} шт</td>
                            <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                              {line.materialsCount} мат. · {line.operationsCount} оп.
                            </td>
                            {showCosts ? (
                              <td className="px-3 py-2 text-right tabular">
                                {unit != null ? (
                                  <span className="inline-flex flex-col items-end gap-0.5">
                                    <span className="font-medium">{formatMoneyUah(unit)}</span>
                                    {sum != null && qty > 1 ? (
                                      <span className="type-caption">
                                        разом {formatMoneyUah(sum)}
                                      </span>
                                    ) : null}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            ) : null}
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => editLine(line)}
                                >
                                  Редагувати
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  aria-label="Видалити позицію"
                                  onClick={() => removeLine(line.key)}
                                >
                                  <IconTrash size={14} />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {error ? <Banner tone="danger">{error}</Banner> : null}
          </>
        }
        right={
          <ProductCatalogPanel
            products={products}
            selectedId={stagingProductId}
            onSelect={selectProduct}
            headerAction={
              <ProductCreatePanel
                sizes={sizeOptions}
                sizeVariants={sizeVariants}
                materialCatalog={materialCatalog}
                operationCatalog={operationCatalog}
                decorationCatalog={decorationCatalog}
                unitOptions={unitOptions}
                variant="ghost"
                size="sm"
                triggerLabel="Новий"
                onCreated={(product) => {
                  setProducts((prev) =>
                    prev.some((row) => row.id === product.id) ? prev : [product, ...prev],
                  );
                  setStagingProductId(product.id);
                  setStagingComposition(
                    syncDraftMaterialPrices(
                      cloneComposition(product, materialCatalog, companyCostMode),
                      {},
                      companyCostMode,
                    ),
                  );
                  setStagingQty({});
                  setStagingComment("");
                  setEditingKey(null);
                }}
              />
            }
          />
        }
      />

      <OrderCreateFooter
        clientLabel={selectedClient?.label ?? null}
        linesCount={lines.length}
        quantity={linesQty}
        estimate={estimate}
        ready={readyToSubmit}
        pending={pending}
        onCancel={requestLeave}
      />
      <UnsavedChangesDialog
        open={leaveOpen}
        pending={pending}
        title="Незбережене замовлення"
        description="Є введені дані. Закрити створення без збереження?"
        onStay={stay}
        onDiscard={discard}
      />
      <UnsavedChangesDialog
        open={switchProductOpen}
        pending={pending}
        title="Незбережена позиція"
        description="У чернетці є зміни. Обрати інший виріб без додавання в список?"
        onStay={() => {
          setSwitchProductOpen(false);
          setPendingProductId(null);
        }}
        onDiscard={() => {
          const nextId = pendingProductId;
          setSwitchProductOpen(false);
          setPendingProductId(null);
          if (nextId) applySelectProduct(nextId);
        }}
      />
    </form>
  );
}

/** Compact fixed status bar — always one short row above the bottom edge. */
function OrderCreateFooter({
  clientLabel,
  linesCount,
  quantity,
  estimate,
  ready,
  pending,
  onCancel,
}: {
  clientLabel: string | null;
  linesCount: number;
  quantity: number;
  estimate: number;
  ready: boolean;
  pending: boolean;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:left-[var(--sidebar-width)]"
      role="status"
    >
      <div className="pointer-events-auto border-t border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_-4px_16px_rgba(15,23,32,0.06)]">
        <div className="mx-auto flex h-12 max-w-[1440px] items-center gap-3 px-4 sm:px-6 xl:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-[12.5px]">
            <FooterStat
              done={Boolean(clientLabel)}
              label="Клієнт"
              value={clientLabel ?? "не обрано"}
            />
            <FooterSep />
            <FooterStat
              done={linesCount > 0}
              label="Позиції"
              value={linesCount > 0 ? String(linesCount) : "0"}
            />
            <FooterSep />
            <FooterStat done={quantity > 0} label="К-сть" value={`${quantity} шт`} />
            {estimate > 0 ? (
              <>
                <FooterSep />
                <span className="tabular shrink-0 font-semibold text-[var(--color-text-primary)]">
                  ≈ {formatMoneyUah(estimate)}
                </span>
              </>
            ) : null}
            {!ready ? (
              <>
                <FooterSep />
                <span className="hidden min-w-0 items-center gap-1 truncate text-[var(--color-warning-text)] sm:inline-flex">
                  <IconAlert size={13} className="shrink-0" />
                  <span className="truncate">Заповніть клієнта і додайте позицію</span>
                </span>
              </>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
              Скасувати
            </Button>
            <Button type="submit" form="order-create-form" size="sm" disabled={pending || !ready}>
              {pending ? "Створення…" : "Створити замовлення"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function FooterSep() {
  return <span className="shrink-0 text-[var(--color-border-strong)]" aria-hidden>
    |
  </span>;
}

function FooterStat({
  label,
  value,
  done,
}: {
  label: string;
  value: string;
  done: boolean;
}) {
  return (
    <span className="inline-flex min-w-0 max-w-[180px] items-center gap-1.5">
      {done ? (
        <IconCheckCircle size={14} className="shrink-0 text-[var(--color-success-text)]" />
      ) : (
        <IconCircle size={14} className="shrink-0 text-[var(--color-text-tertiary)]" />
      )}
      <span className="shrink-0 text-[var(--color-text-tertiary)]">{label}</span>
      <span
        className={cn(
          "truncate font-medium",
          done ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)]",
        )}
        title={value}
      >
        {value}
      </span>
    </span>
  );
}
