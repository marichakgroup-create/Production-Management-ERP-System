"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Field";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { SpecColorPicker } from "@/components/composition/SpecColorPicker";
import {
  colorsForSupplier,
  reconcileColorForSupplier,
} from "@/lib/supplier-colors";
import { swatchForColorLabel } from "@/lib/trim-colors";
import {
  fabricDeliveryTypeLabel,
  normalizeFabricDeliveryType,
  type FabricDeliveryTypeCode,
} from "@/lib/fabric-delivery-types";
import { cn } from "@/lib/utils";
import { SoftBusy } from "@/components/ui/SoftBusy";

export type SupplierDeliveryOption = {
  type: FabricDeliveryTypeCode;
  label: string;
  rateLabel?: string;
};

export type SupplierColorOfferOption = {
  supplierId: string;
  supplierName: string;
  isPrimary?: boolean;
  availableColors: string[];
  preferredDeliveryType?: FabricDeliveryTypeCode | string | null;
  deliveryOptions?: SupplierDeliveryOption[];
};

function encodeSupplierDelivery(
  supplierId: string,
  deliveryType: string | null | undefined,
) {
  return `${supplierId}::${deliveryType || ""}`;
}

function decodeSupplierDelivery(value: string): {
  supplierId: string | null;
  deliveryType: FabricDeliveryTypeCode | null;
} {
  if (!value) return { supplierId: null, deliveryType: null };
  const [supplierId, typeRaw] = value.split("::");
  if (!supplierId) return { supplierId: null, deliveryType: null };
  return {
    supplierId,
    deliveryType: typeRaw ? normalizeFabricDeliveryType(typeRaw) : null,
  };
}

function flattenSupplierDeliveryOptions(offers: SupplierColorOfferOption[]) {
  return offers.flatMap((offer) => {
    const options =
      offer.deliveryOptions && offer.deliveryOptions.length > 0
        ? offer.deliveryOptions
        : [
            {
              type: normalizeFabricDeliveryType(offer.preferredDeliveryType ?? "CARGO"),
              label: fabricDeliveryTypeLabel(
                normalizeFabricDeliveryType(offer.preferredDeliveryType ?? "CARGO"),
              ),
            },
          ];
    return options.map((opt) => ({
      value: encodeSupplierDelivery(offer.supplierId, opt.type),
      supplierId: offer.supplierId,
      deliveryType: opt.type,
      label: `${offer.supplierName} · ${opt.label}${offer.isPrimary ? " · осн." : ""}`,
      rateLabel: opt.rateLabel,
    }));
  });
}

/**
 * Supplier + delivery method first («Постачальник · CARGO»), then color from palette.
 */
export function SupplierColorFields({
  supplierId,
  deliveryType,
  color,
  offers,
  materialFallbackColors = [],
  disabled,
  onSupplierDeliveryChange,
  onColorChange,
  compact,
}: {
  supplierId: string | null | undefined;
  deliveryType?: string | null;
  color: string | null | undefined;
  offers: SupplierColorOfferOption[];
  materialFallbackColors?: string[];
  disabled?: boolean;
  onSupplierDeliveryChange: (next: {
    supplierId: string | null;
    deliveryType: FabricDeliveryTypeCode | null;
  }) => void;
  onColorChange: (color: string | null) => void;
  compact?: boolean;
}) {
  const offerRows = useMemo(
    () =>
      offers.map((row) => ({
        supplierId: row.supplierId,
        isPrimary: row.isPrimary,
        availableColors: row.availableColors,
      })),
    [offers],
  );

  const palette = useMemo(
    () => colorsForSupplier(offerRows, supplierId, materialFallbackColors),
    [offerRows, supplierId, materialFallbackColors],
  );

  const flatOptions = useMemo(() => flattenSupplierDeliveryOptions(offers), [offers]);
  const selectValue = supplierId
    ? encodeSupplierDelivery(supplierId, deliveryType)
    : "";

  if (offers.length === 0 && palette.length === 0) {
    return null;
  }

  const selectEl =
    offers.length > 0 ? (
      <Select
        size="sm"
        className={compact ? "max-w-[14rem] min-w-0 flex-1 basis-[10rem]" : undefined}
        selectClassName={
          compact ? "!h-7 !min-h-7 !rounded-[6px] !px-1.5 !text-[12px]" : undefined
        }
        value={
          flatOptions.some((row) => row.value === selectValue)
            ? selectValue
            : supplierId
              ? encodeSupplierDelivery(
                  supplierId,
                  offers.find((o) => o.supplierId === supplierId)?.preferredDeliveryType ??
                    null,
                )
              : ""
        }
        disabled={disabled}
        placeholder="Постачальник · доставка…"
        onChange={(event) =>
          onSupplierDeliveryChange(decodeSupplierDelivery(event.target.value))
        }
      >
        <option value="">Постачальник · доставка…</option>
        {flatOptions.map((row) => (
          <option key={row.value} value={row.value}>
            {row.label}
            {row.rateLabel ? ` · ${row.rateLabel}` : ""}
          </option>
        ))}
      </Select>
    ) : null;

  if (compact) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {selectEl}
        {supplierId || offers.length === 0 ? (
          palette.length > 0 ? (
            <ColorSelect
              value={color}
              options={palette}
              disabled={disabled}
              onChange={onColorChange}
              className="flex-1 basis-[7.5rem]"
            />
          ) : null
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {offers.length > 0 ? (
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-tertiary)]">
            Постачальник · доставка
          </span>
          {selectEl}
        </label>
      ) : null}

      {supplierId || offers.length === 0 ? (
        <div>
          <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-tertiary)]">
            Колір
          </span>
          {palette.length === 0 ? null : palette.length > 12 ? (
            <ColorSelect
              value={color}
              options={palette}
              disabled={disabled}
              onChange={onColorChange}
              className="max-w-[16rem]"
            />
          ) : (
            <SpecColorPicker
              value={color}
              onChange={onColorChange}
              materialColors={palette}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ProductMaterialSupplierColorEditor({
  productId,
  productMaterialId,
  supplierId,
  deliveryType,
  color,
  offers,
  materialFallbackColors,
  readOnly,
}: {
  productId: string;
  productMaterialId: string;
  supplierId: string | null;
  deliveryType?: string | null;
  color: string | null;
  offers: SupplierColorOfferOption[];
  materialFallbackColors?: string[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function save(next: {
    supplierId?: string | null;
    deliveryType?: string | null;
    colorSnapshot?: string | null;
  }) {
    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("id", productMaterialId);
    if (next.supplierId !== undefined) {
      formData.set("supplierId", next.supplierId ?? "");
    }
    if (next.deliveryType !== undefined) {
      formData.set("deliveryType", next.deliveryType ?? "");
    }
    if (next.colorSnapshot !== undefined) {
      formData.set("colorSnapshot", next.colorSnapshot ?? "");
    }
    startTransition(async () => {
      const { updateProductMaterialSupplierColorAction } = await import(
        "@/server/domains/products/actions"
      );
      await updateProductMaterialSupplierColorAction(formData);
      router.refresh();
    });
  }

  if (readOnly) {
    return (
      <SupplierColorReadOnly
        supplierId={supplierId}
        deliveryType={deliveryType}
        color={color}
        offers={offers}
      />
    );
  }

  return (
    <SupplierColorFields
      supplierId={supplierId}
      deliveryType={deliveryType}
      color={color}
      offers={offers}
      materialFallbackColors={materialFallbackColors}
      disabled={pending}
      compact
      onSupplierDeliveryChange={(next) => {
        const reconciled = reconcileColorForSupplier({
          color,
          supplierId: next.supplierId,
          offers: offers.map((row) => ({
            supplierId: row.supplierId,
            isPrimary: row.isPrimary,
            availableColors: row.availableColors,
          })),
          materialFallback: materialFallbackColors,
        });
        save({
          supplierId: next.supplierId,
          deliveryType: next.deliveryType,
          colorSnapshot: reconciled,
        });
      }}
      onColorChange={(next) => save({ colorSnapshot: next })}
    />
  );
}

/** Same compact supplier · delivery · color control for order BOM rows. */
export function OrderMaterialSupplierColorEditor({
  orderId,
  orderItemMaterialId,
  supplierId,
  deliveryType,
  color,
  offers,
  materialFallbackColors,
  readOnly,
}: {
  orderId: string;
  orderItemMaterialId: string;
  supplierId: string | null;
  deliveryType?: string | null;
  color: string | null;
  offers: SupplierColorOfferOption[];
  materialFallbackColors?: string[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function save(next: {
    supplierId?: string | null;
    deliveryType?: string | null;
    colorSnapshot?: string | null;
  }) {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("id", orderItemMaterialId);
    if (next.supplierId !== undefined) {
      formData.set("supplierId", next.supplierId ?? "");
    }
    if (next.deliveryType !== undefined) {
      formData.set("deliveryType", next.deliveryType ?? "");
    }
    if (next.colorSnapshot !== undefined) {
      formData.set("colorSnapshot", next.colorSnapshot ?? "");
    }
    startTransition(async () => {
      const { updateOrderMaterialTermsAction } = await import(
        "@/server/domains/orders/actions"
      );
      await updateOrderMaterialTermsAction(formData);
      router.refresh();
    });
  }

  if (readOnly) {
    return (
      <SupplierColorReadOnly
        supplierId={supplierId}
        deliveryType={deliveryType}
        color={color}
        offers={offers}
      />
    );
  }

  return (
    <SoftBusy busy={pending} tone="inline" label="Збереження…">
      <div
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <SupplierColorFields
          supplierId={supplierId}
          deliveryType={deliveryType}
          color={color}
          offers={offers}
          materialFallbackColors={materialFallbackColors}
          disabled={pending}
          compact
          onSupplierDeliveryChange={(next) => {
            const reconciled = reconcileColorForSupplier({
              color,
              supplierId: next.supplierId,
              offers: offers.map((row) => ({
                supplierId: row.supplierId,
                isPrimary: row.isPrimary,
                availableColors: row.availableColors,
              })),
              materialFallback: materialFallbackColors,
            });
            save({
              supplierId: next.supplierId,
              deliveryType: next.deliveryType,
              colorSnapshot: reconciled,
            });
          }}
          onColorChange={(next) => save({ colorSnapshot: next })}
        />
      </div>
    </SoftBusy>
  );
}

function SupplierColorReadOnly({
  supplierId,
  deliveryType,
  color,
  offers,
}: {
  supplierId: string | null;
  deliveryType?: string | null;
  color: string | null;
  offers: SupplierColorOfferOption[];
}) {
  const offer = offers.find((row) => row.supplierId === supplierId);
  const deliveryLabel = deliveryType
    ? fabricDeliveryTypeLabel(normalizeFabricDeliveryType(deliveryType))
    : null;
  const parts = [
    offer?.supplierName,
    deliveryLabel,
    color,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  const swatch = color?.trim() ? swatchForColorLabel(color) : null;
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-[var(--color-text-quiet)]">
      {swatch ? (
        <span
          className={cn(
            "size-3 shrink-0 rounded-full ring-1 ring-black/15",
            swatch.bordered && "border border-[var(--color-border-strong)]",
          )}
          style={{ backgroundColor: swatch.swatch }}
          aria-hidden
        />
      ) : null}
      <span className="truncate">{parts.join(" · ")}</span>
    </p>
  );
}
