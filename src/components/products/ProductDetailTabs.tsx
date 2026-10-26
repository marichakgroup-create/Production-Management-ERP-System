import { SegmentedTabs } from "@/components/ui/Tabs";
import { ProductSizeBom } from "@/components/products/ProductSizeBom";
import { ProductPriceCutPanel } from "@/components/products/ProductPriceCutPanel";
import type { TirageCostHint } from "@/components/products/ProductPriceFields";

export type ProductDetailTab = "composition" | "cut" | "price";

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
  const effectiveTab: ProductDetailTab = showPricing
    ? activeTab
    : "composition";
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
            key: "cut",
            label: "Крій",
            href: `/products/${productId}?tab=cut`,
          },
          {
            key: "price",
            label: "Прайс",
            href: `/products/${productId}?tab=price`,
          },
        ]
      : []),
  ];

  const caption =
    effectiveTab === "composition"
      ? showPricing
        ? "Норми на 1 шт. Сітка крою — у «Крій», продажні ціни — у «Прайс»."
        : "Склад виробу (без цін і калькуляції)"
      : effectiveTab === "cut"
        ? "Крій по тиражах. Ставка ₴/шт і сума на тираж; оптимум задає базову розкладку."
        : "Прайс для клієнта. Собів. і маржа рахуються з комплектації та крою.";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="type-caption">{caption}</p>
        </div>
        {tabs.length > 1 ? <SegmentedTabs items={tabs} active={effectiveTab} /> : null}
      </div>

      {effectiveTab === "composition" ? (
        <ProductSizeBom {...bom} />
      ) : (
        <ProductPriceCutPanel
          productId={productId}
          view={effectiveTab === "cut" ? "cut" : "price"}
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
