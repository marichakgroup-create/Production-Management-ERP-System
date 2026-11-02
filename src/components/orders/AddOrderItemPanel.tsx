"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { SidePanel } from "@/components/ui/Overlay";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";
import { useUnsavedCloseGuard } from "@/hooks/useUnsavedCloseGuard";
import { useOrderUnsavedWorkspaceDirty } from "@/components/orders/OrderUnsavedContext";
import { SizeRun } from "@/components/orders/SizeRun";
import { ProductCatalogPanel, type CatalogProduct } from "@/components/orders/ProductCatalogPanel";
import { addOrderItemAction } from "@/server/domains/orders/actions";

export type AddableProduct = Pick<
  CatalogProduct,
  | "id"
  | "label"
  | "nameUk"
  | "internalCode"
  | "imageUrl"
  | "materialsCount"
  | "operationsCount"
  | "decorationsCount"
  | "sizes"
>;

const ORIENTATIVE_SIZE = { code: "ONE", nameUk: "Тираж (орієнтовно)" };

function toCatalogProduct(product: AddableProduct): CatalogProduct {
  return {
    ...product,
    priceTiers: [],
    composition: { materials: [], operations: [], decorations: [] },
  };
}

export function AddOrderItemPanel({
  orderId,
  products,
}: {
  orderId: string;
  products: AddableProduct[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [qtyMode, setQtyMode] = useState<"bySize" | "total">("total");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = useMemo(
    () => products.find((product) => product.id === productId),
    [products, productId],
  );
  const productSizes = selected?.sizes.length
    ? selected.sizes
    : selected
      ? [{ code: "ONE", nameUk: "Без розміру" }]
      : [];
  const hasRealSizes = (selected?.sizes.length ?? 0) > 0;
  const displaySizes =
    qtyMode === "total" && hasRealSizes ? [ORIENTATIVE_SIZE] : productSizes;
  const total =
    qtyMode === "total" && hasRealSizes
      ? quantities.ONE || 0
      : productSizes.reduce((sum, size) => sum + (quantities[size.code] || 0), 0);
  const dirty = Boolean(productId) || total > 0;

  const reset = useCallback(() => {
    setOpen(false);
    setProductId("");
    setQuantities({});
    setQtyMode("total");
    setError(null);
  }, []);

  const { leaveOpen, requestClose, stay, discard } = useUnsavedCloseGuard({
    dirty,
    pending,
    onDiscard: reset,
  });
  useOrderUnsavedWorkspaceDirty(dirty);

  function selectProduct(id: string) {
    setProductId(id);
    setQuantities({});
    setQtyMode("total");
    setError(null);
  }

  function applyQtyMode(next: "bySize" | "total") {
    if (next === qtyMode) return;
    setQtyMode(next);
    if (next === "total") {
      const sum = productSizes.reduce((acc, size) => acc + (quantities[size.code] || 0), 0);
      const value = sum > 0 ? sum : quantities.ONE || 0;
      const nextQty: Record<string, number> = { ONE: value };
      setQuantities(nextQty);
      return;
    }
    const fromOne = quantities.ONE || 0;
    const nextQty: Record<string, number> = {};
    if (productSizes.length === 1) {
      nextQty[productSizes[0]!.code] = fromOne;
    } else {
      for (const size of productSizes) {
        nextQty[size.code] = 0;
      }
    }
    setQuantities(nextQty);
  }

  function submit() {
    if (!selected || total <= 0) return;
    setError(null);
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("productId", selected.id);

    const linesToSend =
      qtyMode === "total" && hasRealSizes
        ? [{ ...ORIENTATIVE_SIZE, quantity: quantities.ONE || 0 }]
        : productSizes.map((size) => ({
            ...size,
            quantity: quantities[size.code] || 0,
          }));

    for (const size of linesToSend) {
      if (size.quantity <= 0) continue;
      formData.append("sizeCode", size.code);
      formData.append("sizeNameUk", size.nameUk);
      formData.append("sizeQty", String(size.quantity));
    }

    startTransition(async () => {
      const result = await addOrderItemAction(formData);
      if (!result.ok) {
        setError(
          result.error === "QUANTITY_REQUIRED"
            ? "Вкажіть кількість хоча б для одного розміру."
            : result.error === "ORDER_LOCKED"
              ? "Замовлення вже у виробництві — позиції не змінюються."
              : result.error === "PRODUCT_NOT_FOUND"
                ? "Цей виріб більше недоступний у каталозі."
                : "Не вдалося додати виріб.",
        );
        return;
      }
      reset();
      router.push(`/orders/${orderId}?tab=configuration&item=${result.itemId}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Додати виріб
      </Button>
      <SidePanel
        open={open}
        onClose={requestClose}
        title="Додати виріб у замовлення"
        description="Оберіть еталон з каталогу, вкажіть тираж — склад скопіюється в цю позицію. Далі його можна правити в таблиці замовлення."
        width="lg"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={requestClose} disabled={pending}>
              Скасувати
            </Button>
            <Button type="button" onClick={submit} disabled={!selected || total <= 0 || pending}>
              {pending ? "Додаємо…" : "Додати в замовлення"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]">
          <ProductCatalogPanel
            products={products.map(toCatalogProduct)}
            selectedId={productId}
            onSelect={selectProduct}
          />
          <div className="space-y-3">
            {selected ? (
              <>
                <div>
                  <p className="type-label">Тираж</p>
                  <p className="type-caption mt-0.5">{selected.nameUk ?? selected.label}</p>
                </div>
                {hasRealSizes ? (
                  <div className="inline-flex rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-0.5">
                    <button
                      type="button"
                      onClick={() => applyQtyMode("total")}
                      className={`rounded-[5px] px-2 py-0.5 text-[11px] font-medium ${
                        qtyMode === "total"
                          ? "bg-white text-[var(--color-text-primary)] shadow-sm"
                          : "text-[var(--color-text-secondary)]"
                      }`}
                    >
                      Загальний тираж
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQtyMode("bySize")}
                      className={`rounded-[5px] px-2 py-0.5 text-[11px] font-medium ${
                        qtyMode === "bySize"
                          ? "bg-white text-[var(--color-text-primary)] shadow-sm"
                          : "text-[var(--color-text-secondary)]"
                      }`}
                    >
                      По розмірах
                    </button>
                  </div>
                ) : null}
                <SizeRun
                  sizes={displaySizes}
                  quantities={quantities}
                  onChange={(code, quantity) =>
                    setQuantities((prev) => ({ ...prev, [code]: quantity }))
                  }
                />
                {qtyMode === "total" && hasRealSizes ? (
                  <p className="type-caption text-[var(--color-text-tertiary)]">
                    Орієнтовний тираж без розкладки по розмірах. Точну сітку задасте перед
                    виробництвом у комплектації замовлення.
                  </p>
                ) : null}
                <p className="type-caption tabular">Разом {total} шт</p>
              </>
            ) : (
              <p className="type-body-secondary">Спочатку оберіть виріб зліва.</p>
            )}
            {error ? <Banner tone="danger">{error}</Banner> : null}
          </div>
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
