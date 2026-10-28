import { SegmentedTabs } from "@/components/ui/Tabs";
import { ProductSizeBom } from "@/components/products/ProductSizeBom";
import { ProductPriceCutPanel } from "@/components/products/ProductPriceCutPanel";
import type { TirageCostHint } from "@/components/products/ProductPriceFields";

export type ProductDetailTab = "composition" | "pricing";

type BomProps = React.ComponentProps<typeof ProductSizeBom>;

export function ProductDetailTabs({
  productId,
  activeTab,
  compositionCount,
  bom,
  cut,
  deliveryOp = null,
  price,
  showPricing = true,
}: {
  productId: string;
  activeTab: ProductDetailTab;
  compositionCount: number;
  bom: BomProps;
  cut: {
    productId: string;
    optimalQty: number | null;
    tiers: Array<{ minQuantity: number; ratePerUnit: number }>;
  };
  deliveryOp?: {
    productOperationId: string;
    name: string;
    tiers: Array<{ minQuantity: number; ratePerUnit: number }>;
  } | null;
  price: {
    productId: string;
    isBaseModel: boolean;
    tiers: Array<{
      minQuantity: number;
      pricePerUnit: number;
      showOnCard?: boolean;
      sewingMultiplier?: number | null;
    }>;
    costHints?: TirageCostHint[];
    showDeliveryColumn?: boolean;
  };
  showPricing?: boolean;
}) {
  const effectiveTab = showPricing ? activeTab : "composition";
  const tabs = [
    {
      key: "composition",
      label: "Комплектація",
      href: `/products/${productId}?tab=composition`,
      count: compositionCount,
    },
    ...(showPricing
      ? [
          {
            key: "pricing",
            label: "Прайс і крій",
            href: `/products/${productId}?tab=pricing`,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="type-caption">
            {effectiveTab === "composition"
              ? showPricing
                ? "Норми на 1 шт (і доставка теж). Сума доставки на тираж = ₴/од. × кількість; сітка — у «Прайс і крій»."
                : "Склад виробу (без цін і калькуляції)"
              : "Калькуляція на весь тираж. Статті не перетинаються: Мат + Крій + Пошив + Достав (тканини CARGO/НП + операція) + Пакування + ПВ = Собів."}
          </p>
        </div>
        {tabs.length > 1 ? <SegmentedTabs items={tabs} active={effectiveTab} /> : null}
      </div>

      {effectiveTab === "composition" ? (
        <ProductSizeBom {...bom} />
      ) : (
        <ProductPriceCutPanel
          productId={productId}
          optimalQty={cut.optimalQty}
          cutTiers={cut.tiers}
          deliveryOp={deliveryOp}
          isBaseModel={price.isBaseModel}
          priceTiers={price.tiers}
          costHints={price.costHints}
          showDeliveryColumn={price.showDeliveryColumn}
        />
      )}
    </div>
  );
}
