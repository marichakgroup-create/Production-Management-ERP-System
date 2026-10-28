"use client";

import { useState } from "react";
import {
  DEFAULT_CUT_RATE_TIERS,
  ProductCutRateFields,
  type CutRateTierDraft,
} from "@/components/products/ProductCutRateFields";

export function CreateProductCutRatePanel() {
  const [tiers, setTiers] = useState<CutRateTierDraft[]>(DEFAULT_CUT_RATE_TIERS);
  const [optimalQty, setOptimalQty] = useState(100);
  const [optimalCutTotal, setOptimalCutTotal] = useState(0);

  return (
    <div className="space-y-3 rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_1px_0_rgba(15,23,32,0.03)]">
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)]">
          Ставки крою (за бажанням)
        </h3>
        <p className="type-caption mt-0.5">
          Можна заповнити зараз або пізніше на картці виробу у «Прайс і крій».
        </p>
      </div>
      <input type="hidden" name="cutOptimalQty" value={optimalQty || ""} />
      {tiers.map((tier, index) => (
        <div key={`hidden-cut-${index}`} className="hidden">
          <input type="hidden" name="cutTierMinQuantity" value={tier.minQuantity || ""} />
          <input type="hidden" name="cutTierRate" value={tier.ratePerUnit || ""} />
        </div>
      ))}
      <ProductCutRateFields
        tiers={tiers}
        onTiersChange={setTiers}
        optimalQty={optimalQty}
        onOptimalQtyChange={setOptimalQty}
        optimalCutTotal={optimalCutTotal}
        onOptimalCutTotalChange={setOptimalCutTotal}
      />
    </div>
  );
}
