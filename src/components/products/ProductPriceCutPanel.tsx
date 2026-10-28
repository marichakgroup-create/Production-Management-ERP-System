"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  updateProductCommercialPricesAction,
  updateProductCutRatesAction,
  updateProductOperationRateTiersAction,
} from "@/server/domains/products/actions";
import {
  hintForQty,
  hydrateCommercialPriceTiers,
  type TirageCostHint,
} from "@/components/products/ProductPriceFields";
import { resolveCutRatePerUnit, resolveOptimalCutQty, cutRateFromOptimalJobTotal } from "@/lib/cut-rate";
import { resolveCommercialPricePerUnit } from "@/lib/commercial-price";
import { resolveQuantityTierRate } from "@/lib/quantity-tiers";
import { defaultSewingMultiplierForQty, suggestSellingFromSewingMarkup } from "@/lib/sewing-markup";
import {
  buildTirageFormulaTips,
  buildTirageHeaderTips,
} from "@/lib/tirage-formula-tips";
import { cn, formatAmountWhole, formatMoneyUah } from "@/lib/utils";
import { RowEditActions, ROW_DIRTY_CLASS } from "@/components/ui/RowEditActions";

type Row = {
  uid: string;
  minQuantity: number;
  cutRate: number;
  deliveryRate: number;
  pricePerUnit: number;
  sewingMultiplier: number;
  showOnCard: boolean;
};

type RowDraft = {
  minQuantity?: string;
  cutRate?: string;
  deliveryRate?: string;
  pricePerUnit?: string;
  sewingMultiplier?: string;
};

function newRowUid() {
  return `tirage-${Math.random().toString(36).slice(2, 10)}`;
}

function withUids(rows: Array<Omit<Row, "uid"> & { uid?: string }>): Row[] {
  return rows.map((row) => ({ ...row, uid: row.uid ?? newRowUid() }));
}

function parseDraftNumber(raw: string | undefined, fallback: number) {
  if (raw == null || raw.trim() === "" || raw === "-" || raw === "." || raw === "-.") {
    return fallback;
  }
  const next = Number(raw);
  return Number.isFinite(next) ? next : fallback;
}

function draftDirty(draft: RowDraft | undefined, row: Row) {
  if (!draft) return false;
  if (draft.minQuantity != null && draft.minQuantity !== String(row.minQuantity)) return true;
  if (draft.cutRate != null && draft.cutRate !== String(row.cutRate)) return true;
  if (draft.deliveryRate != null && draft.deliveryRate !== String(row.deliveryRate)) return true;
  if (draft.pricePerUnit != null && draft.pricePerUnit !== String(row.pricePerUnit)) return true;
  if (draft.sewingMultiplier != null && draft.sewingMultiplier !== String(row.sewingMultiplier)) {
    return true;
  }
  return false;
}

function effectiveRow(row: Row, draft: RowDraft | undefined): Row {
  if (!draft) return row;
  return {
    ...row,
    minQuantity: Math.max(1, Math.round(parseDraftNumber(draft.minQuantity, row.minQuantity)) || 1),
    cutRate: Math.max(0, parseDraftNumber(draft.cutRate, row.cutRate)),
    deliveryRate: Math.max(0, parseDraftNumber(draft.deliveryRate, row.deliveryRate)),
    pricePerUnit: Math.max(0, parseDraftNumber(draft.pricePerUnit, row.pricePerUnit)),
    sewingMultiplier: Math.max(0, parseDraftNumber(draft.sewingMultiplier, row.sewingMultiplier)),
  };
}

type DeliveryOp = {
  productOperationId: string;
  name: string;
  tiers: Array<{ minQuantity: number; ratePerUnit: number }>;
};

type Baseline = {
  rows: Row[];
  optimalQty: number;
  optimalCutTotal: number;
  isBaseModel: boolean;
};

/** Digit inputs — width comes from the column / className. */
const DIGIT_INPUT =
  "h-7 min-w-0 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 text-right text-[12.5px] tabular-nums text-[var(--color-text)] " +
  "focus-visible:border-[var(--color-border-strong)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color-mix(in_srgb,var(--color-text-secondary)_18%,transparent)] " +
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function CompactInput({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={[DIGIT_INPUT, className ?? ""].join(" ")} />;
}

/** Dense table cell — no ₴ (unit shown once in the table caption). Whole ₴ only. */
function MoneyCell({
  perUnit,
  total,
  tone,
  tip,
}: {
  perUnit: number;
  total: number;
  tone?: "quiet" | "strong";
  tip?: string;
}) {
  const color =
    tone === "strong"
      ? "font-medium text-[var(--color-text)]"
      : "text-[var(--color-text-secondary)]";
  const body = (
    <div className="flex flex-col items-end gap-0.5">
      <span className={`type-mono text-[12px] tabular-nums ${color}`}>
        {Number.isFinite(perUnit) ? formatAmountWhole(perUnit) : "—"}
      </span>
      <span className="type-caption tabular-nums text-[var(--color-text-quiet)]">
        {Number.isFinite(total) ? formatAmountWhole(total) : "—"}
      </span>
    </div>
  );
  return tip ? <FormulaTip tip={tip}>{body}</FormulaTip> : body;
}

/** Hover tip: CSS for cells; fixed portal for headers so overflow-x does not clip. */
function FormulaTip({
  tip,
  children,
  className,
  placement = "above",
}: {
  tip: string;
  children: ReactNode;
  className?: string;
  placement?: "above" | "below";
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  function show() {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({
      top: placement === "below" ? r.bottom + 6 : r.top - 6,
      left: r.left + r.width / 2,
    });
    setOpen(true);
  }

  function hide() {
    setOpen(false);
  }

  return (
    <span
      ref={anchorRef}
      className={cn("relative inline-flex max-w-full cursor-help", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && coords
        ? createPortal(
            <span
              role="tooltip"
              className={
                "pointer-events-none fixed z-[100] w-max max-w-[20rem] -translate-x-1/2 " +
                (placement === "above" ? "-translate-y-full " : "") +
                "rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-left " +
                "text-[11px] leading-snug font-normal normal-case tracking-normal whitespace-pre-line " +
                "text-[var(--color-text-secondary)] shadow-[var(--shadow-soft)]"
              }
              style={{ top: coords.top, left: coords.left }}
            >
              {tip}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

function HeaderTip({ tip, children }: { tip: string; children: ReactNode }) {
  return (
    <FormulaTip tip={tip} placement="below">
      <span className="border-b border-dotted border-[var(--color-text-quiet)]/55">{children}</span>
    </FormulaTip>
  );
}

const thClass = "px-2 py-2 type-caption font-medium text-[var(--color-text-quiet)]";
const tdClass = "px-2 py-1.5 align-middle";
const tdNum = `${tdClass} whitespace-nowrap text-right`;

const LEAVE_MESSAGE =
  "Є незбережені зміни в крої / прайсі. Зберегти їх чи вийти без змін?";

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function cloneRows(rows: Row[]): Row[] {
  return rows.map((row) => ({ ...row }));
}

function rowsEqual(a: Row[], b: Row[]) {
  if (a.length !== b.length) return false;
  return a.every((row, index) => {
    const other = b[index];
    if (!other) return false;
    return (
      row.minQuantity === other.minQuantity &&
      row.cutRate === other.cutRate &&
      row.deliveryRate === other.deliveryRate &&
      row.pricePerUnit === other.pricePerUnit &&
      row.sewingMultiplier === other.sewingMultiplier &&
      row.showOnCard === other.showOnCard
    );
  });
}

function sortRows(rows: Row[]) {
  return [...rows].sort((a, b) => a.minQuantity - b.minQuantity);
}

function ensureOptimalRow(rows: Row[], optimalQty: number, cutRate: number): Row[] {
  if (!(optimalQty > 0)) return rows;
  const idx = rows.findIndex((row) => row.minQuantity === optimalQty);
  if (idx >= 0) {
    const next = [...rows];
    next[idx] = { ...next[idx]!, cutRate };
    return sortRows(next);
  }
  const last = rows[rows.length - 1];
  return sortRows([
    ...rows,
    {
      uid: newRowUid(),
      minQuantity: optimalQty,
      cutRate,
      deliveryRate: last?.deliveryRate ?? 0,
      pricePerUnit: last?.pricePerUnit ?? 0,
      sewingMultiplier: last?.sewingMultiplier ?? defaultSewingMultiplierForQty(optimalQty),
      showOnCard: false,
    },
  ]);
}

/** Розкладає крій: нижче оптимуму — total÷тираж; від оптимуму й вище — мінімум = ставка оптимуму. */
function spreadCutFromOptimal(
  rows: Row[],
  optimalTotal: number,
  optimalQty: number,
): Row[] {
  return rows.map((row) => ({
    ...row,
    cutRate: cutRateFromOptimalJobTotal(optimalTotal, row.minQuantity, optimalQty),
  }));
}

/** Mutually exclusive tirage totals. Собів = мат + крій + пошив + достав + інші + ПВ. */
function liveTirageSheet(args: {
  hint: TirageCostHint | null;
  qty: number;
  cutRate: number;
  /** Editable «Доставка» operation ₴/шт (0 when no such op). */
  deliveryRate: number;
}) {
  const qty = args.qty > 0 ? args.qty : 0;
  const materials = roundMoney((args.hint?.materialsPerUnit ?? 0) * qty);
  const sewing = roundMoney((args.hint?.sewingPerUnit ?? 0) * qty);
  const other = roundMoney((args.hint?.otherOpsPerUnit ?? 0) * qty);
  const pv = roundMoney((args.hint?.additionalPerUnit ?? 0) * qty);
  const cut = roundMoney(args.cutRate * qty);
  const materialDelivery = roundMoney((args.hint?.materialDeliveryPerUnit ?? 0) * qty);
  const opDelivery = roundMoney(args.deliveryRate * qty);
  const delivery = roundMoney(materialDelivery + opDelivery);
  const cost = roundMoney(materials + cut + sewing + delivery + other + pv);
  return { materials, sewing, other, pv, cut, delivery, materialDelivery, opDelivery, cost };
}

export function ProductPriceCutPanel({
  productId,
  optimalQty: initialOptimalQty,
  cutTiers,
  deliveryOp = null,
  isBaseModel: initialIsBaseModel,
  priceTiers,
  costHints = [],
  onDirtyChange,
  showDeliveryColumn: forceShowDelivery = false,
}: {
  productId: string;
  optimalQty: number | null;
  cutTiers: Array<{ minQuantity: number; ratePerUnit: number }>;
  deliveryOp?: DeliveryOp | null;
  isBaseModel: boolean;
  priceTiers: Array<{
    minQuantity: number;
    pricePerUnit: number;
    showOnCard?: boolean;
    sewingMultiplier?: number | null;
  }>;
  costHints?: TirageCostHint[];
  onDirtyChange?: (dirty: boolean) => void;
  /** Force «Достав.» column even when computed amount is still 0. */
  showDeliveryColumn?: boolean;
}) {
  const router = useRouter();
  const hasDeliveryOp = Boolean(deliveryOp);
  const hasMaterialDelivery = costHints.some(
    (hint) => (hint.materialDeliveryPerUnit ?? 0) > 0 || (hint.deliveryPerUnit ?? 0) > 0,
  );
  const showDeliveryColumn =
    forceShowDelivery || hasDeliveryOp || hasMaterialDelivery;
  const deliveryTiers = deliveryOp?.tiers ?? [];
  const dirtyRef = useRef(false);
  const pendingHrefRef = useRef<string | null>(null);
  const headerTips = useMemo(() => {
    const sample = costHints.find((h) => (h.otherLineNames?.length ?? 0) > 0) ?? costHints[0];
    return buildTirageHeaderTips({
      otherLineNames: sample?.otherLineNames,
      otherHasExtraAdditional: sample?.otherHasExtraAdditional,
      hasMaterialDelivery: costHints.some((h) => (h.materialDeliveryPerUnit ?? 0) > 0),
      hasDeliveryOp: Boolean(deliveryOp),
    });
  }, [costHints, deliveryOp]);

  const initialMerged = useMemo(() => {
    const qtySet = new Set<number>();
    for (const t of cutTiers) qtySet.add(t.minQuantity);
    for (const t of priceTiers) qtySet.add(t.minQuantity);
    for (const t of deliveryTiers) qtySet.add(t.minQuantity);
    const qtys = [...qtySet].sort((a, b) => a - b);
    if (qtys.length === 0) qtys.push(50);

    const cutMap = new Map(cutTiers.map((t) => [t.minQuantity, t.ratePerUnit]));
    const priceMap = new Map(priceTiers.map((t) => [t.minQuantity, t.pricePerUnit]));
    const cardMap = new Map(priceTiers.map((t) => [t.minQuantity, t.showOnCard === true]));
    const multMap = new Map(
      priceTiers.map((t) => [
        t.minQuantity,
        t.sewingMultiplier != null && Number(t.sewingMultiplier) > 0
          ? Number(t.sewingMultiplier)
          : null,
      ]),
    );
    const deliveryFallback = deliveryTiers[0]?.ratePerUnit ?? 0;

    const base = qtys.map((q) => ({
      minQuantity: q,
      cutRate: cutMap.get(q) ?? 0,
      deliveryRate: resolveQuantityTierRate({
        quantity: q,
        tiers: deliveryTiers,
        fallbackRate: deliveryFallback,
      }),
      pricePerUnit: priceMap.get(q) ?? 0,
      sewingMultiplier: multMap.get(q) ?? defaultSewingMultiplierForQty(q),
      showOnCard: cardMap.get(q) ?? false,
    }));

    return withUids(
      hydrateCommercialPriceTiers(base, costHints).map((row, index) => ({
        minQuantity: row.minQuantity,
        pricePerUnit: row.pricePerUnit,
        sewingMultiplier: row.sewingMultiplier ?? defaultSewingMultiplierForQty(row.minQuantity),
        cutRate: base[index]?.cutRate ?? 0,
        deliveryRate: base[index]?.deliveryRate ?? 0,
        showOnCard: base[index]?.showOnCard ?? false,
      })),
    );
  }, [cutTiers, priceTiers, costHints, deliveryTiers]);

  const resolvedInitialOptimal = useMemo(() => {
    if (initialOptimalQty != null && initialOptimalQty > 0) return initialOptimalQty;
    return (
      resolveOptimalCutQty({
        optimalQty: null,
        tiers: cutTiers.map((t) => ({ minQuantity: t.minQuantity, ratePerUnit: t.ratePerUnit })),
      }) ??
      cutTiers[cutTiers.length - 1]?.minQuantity ??
      50
    );
  }, [initialOptimalQty, cutTiers]);

  const initialOptimalTotal = useMemo(() => {
    const rate =
      cutTiers.find((t) => t.minQuantity === resolvedInitialOptimal)?.ratePerUnit ??
      cutTiers[cutTiers.length - 1]?.ratePerUnit ??
      0;
    return Math.round(rate * resolvedInitialOptimal * 100) / 100;
  }, [cutTiers, resolvedInitialOptimal]);

  const [rows, setRows] = useState(() => cloneRows(initialMerged));
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [optimalQty, setOptimalQty] = useState(resolvedInitialOptimal);
  const [optimalCutTotal, setOptimalCutTotal] = useState(initialOptimalTotal);
  const [isBaseModel, setIsBaseModel] = useState(initialIsBaseModel);
  const [baseline, setBaseline] = useState<Baseline>(() => ({
    rows: cloneRows(initialMerged),
    optimalQty: resolvedInitialOptimal,
    optimalCutTotal: initialOptimalTotal,
    isBaseModel: initialIsBaseModel,
  }));
  const [message, setMessage] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hasUnconfirmedDrafts = Object.keys(drafts).some((uid) => {
    const row = rows.find((item) => item.uid === uid);
    return row ? draftDirty(drafts[uid], row) : false;
  });

  const isDirty =
    hasUnconfirmedDrafts ||
    !rowsEqual(rows, baseline.rows) ||
    optimalQty !== baseline.optimalQty ||
    optimalCutTotal !== baseline.optimalCutTotal ||
    isBaseModel !== baseline.isBaseModel;

  function patchDraft(uid: string, patch: RowDraft) {
    setDrafts((prev) => ({
      ...prev,
      [uid]: { ...prev[uid], ...patch },
    }));
  }

  function confirmRowDraft(uid: string) {
    const row = rows.find((item) => item.uid === uid);
    const draft = drafts[uid];
    if (!row || !draft) {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[uid];
        return next;
      });
      return;
    }
    let nextRow = effectiveRow(row, draft);
    if (draft.sewingMultiplier != null && draft.pricePerUnit == null) {
      const hint = hintForQty(costHints, nextRow.minQuantity);
      const sewingPerUnit = hint?.sewingPerUnit ?? 0;
      const sheet = liveTirageSheet({
        hint,
        qty: nextRow.minQuantity,
        cutRate: nextRow.cutRate,
        deliveryRate: hasDeliveryOp ? nextRow.deliveryRate : 0,
      });
      const costPerUnit = nextRow.minQuantity > 0 ? sheet.cost / nextRow.minQuantity : 0;
      if (sewingPerUnit > 0) {
        nextRow = {
          ...nextRow,
          pricePerUnit: suggestSellingFromSewingMarkup({
            costPerUnit,
            sewingPerUnit,
            multiplier: nextRow.sewingMultiplier,
          }),
        };
      }
    }
    setRows((prev) => sortRows(prev.map((item) => (item.uid === uid ? nextRow : item))));
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
    if (
      nextRow.minQuantity === optimalQty &&
      draft.cutRate != null &&
      Number.isFinite(Number(draft.cutRate))
    ) {
      setOptimalCutTotal(Math.round(nextRow.cutRate * optimalQty * 100) / 100);
    }
  }

  function cancelRowDraft(uid: string) {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  }

  function removeRow(uid: string) {
    setRows((prev) => prev.filter((row) => row.uid !== uid));
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  }

  useEffect(() => {
    dirtyRef.current = isDirty;
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = LEAVE_MESSAGE;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]");
      if (!anchor) return;
      const hrefAttr = anchor.getAttribute("href");
      if (
        !hrefAttr ||
        hrefAttr.startsWith("#") ||
        hrefAttr.startsWith("mailto:") ||
        hrefAttr.startsWith("tel:")
      ) {
        return;
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(hrefAttr, window.location.href);
      } catch {
        return;
      }
      if (nextUrl.origin !== window.location.origin) return;
      const next = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (next === current) return;
      event.preventDefault();
      event.stopPropagation();
      pendingHrefRef.current = next;
      setPendingHref(next);
      setLeaveOpen(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [isDirty]);

  const previewQty = rows[0]?.minQuantity || 50;
  const previewCut = resolveCutRatePerUnit({
    quantity: previewQty,
    optimalQty,
    tiers: rows.map((r) => ({ minQuantity: r.minQuantity, ratePerUnit: r.cutRate })),
    fallbackRate: rows[rows.length - 1]?.cutRate ?? 0,
  });
  const previewPrice =
    resolveCommercialPricePerUnit({
      quantity: previewQty,
      tiers: rows.map((r) => ({ minQuantity: r.minQuantity, pricePerUnit: r.pricePerUnit })),
      fallbackPrice: rows[0]?.pricePerUnit ?? 0,
    }) ?? 0;

  function applyOptimal(nextQty: number, nextTotal: number, spreadAll: boolean) {
    const qty = Math.max(1, Math.round(nextQty) || 1);
    const total = Math.max(0, Number.isFinite(nextTotal) ? nextTotal : 0);
    const rate = cutRateFromOptimalJobTotal(total, qty, qty);
    setOptimalQty(qty);
    setOptimalCutTotal(Math.round(total * 100) / 100);
    setRows((prev) => {
      const withRow = ensureOptimalRow(prev, qty, rate);
      return spreadAll ? spreadCutFromOptimal(withRow, total, qty) : withRow;
    });
  }

  function addTirage() {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      const nextQty = last ? last.minQuantity * 2 : 50;
      const next: Row = {
        uid: newRowUid(),
        minQuantity: nextQty,
        cutRate: cutRateFromOptimalJobTotal(optimalCutTotal, nextQty, optimalQty),
        deliveryRate: last?.deliveryRate ?? 0,
        pricePerUnit: last?.pricePerUnit ?? 0,
        sewingMultiplier: last?.sewingMultiplier ?? defaultSewingMultiplierForQty(nextQty),
        showOnCard: false,
      };
      const hydrated = hydrateCommercialPriceTiers(
        [...prev, next].map((r) => ({
          minQuantity: r.minQuantity,
          pricePerUnit: r.pricePerUnit,
          sewingMultiplier: r.sewingMultiplier,
          cutRate: r.cutRate,
        })),
        costHints,
      );
      return hydrated.map((h, i) => ({
        uid: i < prev.length ? prev[i]!.uid : next.uid,
        minQuantity: h.minQuantity,
        cutRate: i < prev.length ? prev[i]!.cutRate : next.cutRate,
        deliveryRate: i < prev.length ? prev[i]!.deliveryRate : next.deliveryRate,
        pricePerUnit: h.pricePerUnit,
        sewingMultiplier: h.sewingMultiplier ?? defaultSewingMultiplierForQty(h.minQuantity),
        showOnCard: i < prev.length ? prev[i]!.showOnCard : false,
      }));
    });
  }

  function markSaved(nextRows: Row[], nextOptimalQty: number, nextOptimalTotal: number, nextBase: boolean) {
    setBaseline({
      rows: cloneRows(nextRows),
      optimalQty: nextOptimalQty,
      optimalCutTotal: nextOptimalTotal,
      isBaseModel: nextBase,
    });
  }

  async function persist(): Promise<boolean> {
    if (saving) return false;
    setMessage(null);
    setSaving(true);
    const flushed = sortRows(rows.map((row) => effectiveRow(row, drafts[row.uid])));
    if (Object.keys(drafts).length > 0) {
      setRows(flushed);
      setDrafts({});
    }
    const snapshotRows = cloneRows(flushed);
    const snapshotOptimalQty = optimalQty;
    const snapshotOptimalTotal = optimalCutTotal;
    const snapshotBaseModel = isBaseModel;
    try {
      const cutResult = await updateProductCutRatesAction({
        productId,
        optimalQty: snapshotOptimalQty,
        tiers: snapshotRows.map((r) => ({
          minQuantity: r.minQuantity,
          ratePerUnit: r.cutRate,
        })),
      });
      if (!cutResult.ok) {
        setMessage(cutResult.error);
        return false;
      }
      if (deliveryOp) {
        const formData = new FormData();
        formData.set("productId", productId);
        formData.set("productOperationId", deliveryOp.productOperationId);
        formData.set(
          "rateTiersJson",
          JSON.stringify(
            snapshotRows.map((r) => ({
              minQuantity: r.minQuantity,
              ratePerUnit: r.deliveryRate,
            })),
          ),
        );
        const deliveryResult = await updateProductOperationRateTiersAction(formData);
        if (!deliveryResult.ok) {
          setMessage("Не вдалося зберегти доставку");
          return false;
        }
      }
      const priceResult = await updateProductCommercialPricesAction({
        productId,
        isBaseModel: snapshotBaseModel,
        tiers: snapshotRows.map((r) => ({
          minQuantity: r.minQuantity,
          pricePerUnit: r.pricePerUnit,
          showOnCard: r.showOnCard,
          sewingMultiplier: r.sewingMultiplier,
        })),
      });
      if (!priceResult.ok) {
        setMessage(priceResult.error);
        return false;
      }
      markSaved(snapshotRows, snapshotOptimalQty, snapshotOptimalTotal, snapshotBaseModel);
      setMessage(
        hasDeliveryOp ? "Крій, доставку і прайс збережено" : "Крій і прайс збережено",
      );
      // Soft refresh in background — do not block UI / wipe local rows.
      void router.refresh();
      return true;
    } catch {
      setMessage("Помилка збереження. Спробуйте ще раз.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function discardAndLeave() {
    const href = pendingHrefRef.current ?? pendingHref;
    setLeaveOpen(false);
    setPendingHref(null);
    pendingHrefRef.current = null;
    setRows(cloneRows(baseline.rows));
    setDrafts({});
    setOptimalQty(baseline.optimalQty);
    setOptimalCutTotal(baseline.optimalCutTotal);
    setIsBaseModel(baseline.isBaseModel);
    if (href) router.push(href);
  }

  async function saveAndLeave() {
    const href = pendingHrefRef.current ?? pendingHref;
    const ok = await persist();
    if (!ok) return;
    setLeaveOpen(false);
    setPendingHref(null);
    pendingHrefRef.current = null;
    if (href) router.push(href);
  }

  return (
    <div className="space-y-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-label">Прайс і крій</p>
        </div>
        <label className="inline-flex items-center gap-2 type-caption">
          <input
            type="checkbox"
            checked={isBaseModel}
            onChange={(event) => setIsBaseModel(event.target.checked)}
            className="h-4 w-4 rounded border-[var(--color-border)]"
          />
          Базова модель (без націнки за крій)
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
        <label className="flex flex-col gap-1">
          <span className="type-caption text-[var(--color-text-quiet)]">Оптимум, шт</span>
          <CompactInput
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className="h-8 w-[7rem] text-[13px]"
            value={optimalQty}
            onChange={(event) => applyOptimal(Number(event.target.value), optimalCutTotal, true)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="type-caption text-[var(--color-text-quiet)]">Крій на оптимум, ₴</span>
          <CompactInput
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            className="h-8 w-[8rem] text-[13px]"
            value={optimalCutTotal}
            onChange={(event) => applyOptimal(optimalQty, Number(event.target.value), true)}
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="type-caption text-[var(--color-text-quiet)]">₴/шт</span>
          <p className="flex h-8 items-center type-mono text-[13px] font-semibold tabular-nums text-[var(--color-text)]">
            {formatMoneyUah(cutRateFromOptimalJobTotal(optimalCutTotal, optimalQty, optimalQty))}
          </p>
        </div>
      </div>

      {message ? <p className="type-caption text-[var(--color-text-muted)]">{message}</p> : null}
      {hasUnconfirmedDrafts ? (
        <p className="type-caption text-[var(--color-warning-text)]">
          Підтвердіть рядок галочкою або скасуйте ✕ — зміни ще не застосовані.
        </p>
      ) : isDirty ? (
        <p className="type-caption text-[var(--color-warning-text)]">Є незбережені зміни</p>
      ) : null}

      <div className="w-full overflow-x-auto rounded-[12px] border border-[var(--color-border)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-divider)] bg-[var(--color-bg)]/40 px-2.5 py-1.5">
          <p className="type-caption text-[var(--color-text-quiet)]">
            Редагуйте клітинку → підтвердіть галочкою в рядку. Основне — ₴/шт · сіре під ним — сума
            на тираж · Мат + Крій + Пошив + Достав + Пакування + ПВ = Собів
          </p>
        </div>
        <table className="w-full min-w-[58rem] table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[3.25rem]" />
            <col className="w-[5.5rem]" />
            <col className="w-[5.75rem]" />
            {showDeliveryColumn ? <col className="w-[5.75rem]" /> : null}
            <col />
            <col />
            <col />
            <col />
            <col />
            <col className="w-[4.5rem]" />
            <col className="w-[6.75rem]" />
            <col />
            <col className="w-[3.75rem]" />
            <col className="w-[4.5rem]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--color-divider)] bg-[var(--color-bg)]/50">
              <th className={`${thClass} text-center`}>
                <HeaderTip tip={headerTips.card}>Картка</HeaderTip>
              </th>
              <th className={thClass}>
                <HeaderTip tip={headerTips.qty}>Тираж</HeaderTip>
              </th>
              <th className={thClass}>
                <HeaderTip tip={headerTips.cut}>Крій</HeaderTip>
              </th>
              {showDeliveryColumn ? (
                <th className={thClass}>
                  <HeaderTip tip={headerTips.delivery}>Достав.</HeaderTip>
                </th>
              ) : null}
              <th className={`${thClass} text-right`}>
                <HeaderTip tip={headerTips.materials}>Мат.</HeaderTip>
              </th>
              <th className={`${thClass} text-right`}>
                <HeaderTip tip={headerTips.sewing}>Пошив</HeaderTip>
              </th>
              <th className={`${thClass} text-right`}>
                <HeaderTip tip={headerTips.other}>Пакування</HeaderTip>
              </th>
              <th className={`${thClass} text-right`}>
                <HeaderTip tip={headerTips.pv}>ПВ</HeaderTip>
              </th>
              <th className={`${thClass} text-right`}>
                <HeaderTip tip={headerTips.cost}>Собів.</HeaderTip>
              </th>
              <th className={`${thClass} text-right`}>
                <HeaderTip tip={headerTips.multiplier}>×</HeaderTip>
              </th>
              <th className={thClass}>
                <HeaderTip tip={headerTips.price}>Ціна</HeaderTip>
              </th>
              <th className={`${thClass} text-right`}>
                <HeaderTip tip={headerTips.profit}>Прибуток</HeaderTip>
              </th>
              <th className={`${thClass} text-right`}>
                <HeaderTip tip={headerTips.margin}>Маржа</HeaderTip>
              </th>
              <th className={thClass} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const draft = drafts[row.uid];
              const live = effectiveRow(row, draft);
              const rowPending = draftDirty(draft, row);
              const hint = hintForQty(costHints, live.minQuantity);
              const sewingPerUnit = hint?.sewingPerUnit ?? 0;
              const qty = live.minQuantity;
              const sheet = liveTirageSheet({
                hint,
                qty,
                cutRate: live.cutRate,
                deliveryRate: hasDeliveryOp ? live.deliveryRate : 0,
              });
              const selling = roundMoney(live.pricePerUnit * qty);
              const profit = roundMoney(selling - sheet.cost);
              const marginPercent = selling > 0 ? (profit / selling) * 100 : 0;
              const materialDeliveryPerUnit = hint?.materialDeliveryPerUnit ?? 0;
              const deliveryPerUnit =
                qty > 0 ? roundMoney(sheet.delivery / qty) : materialDeliveryPerUnit;
              const perUnit = {
                materials: hint?.materialsPerUnit ?? 0,
                sewing: sewingPerUnit,
                other: hint?.otherOpsPerUnit ?? 0,
                pv: hint?.additionalPerUnit ?? 0,
                delivery: deliveryPerUnit,
                cost: qty > 0 ? roundMoney(sheet.cost / qty) : 0,
                profit: qty > 0 ? roundMoney(profit / qty) : 0,
              };
              const tips = buildTirageFormulaTips({
                qty,
                cutRate: live.cutRate,
                cutTotal: sheet.cut,
                deliveryRate: hasDeliveryOp ? live.deliveryRate : 0,
                deliveryTotal: sheet.delivery,
                materialDeliveryTotal: sheet.materialDelivery,
                opDeliveryTotal: sheet.opDelivery,
                deliveryName: deliveryOp?.name,
                materials: sheet.materials,
                sewingTotal: sheet.sewing,
                sewingPerUnit,
                other: sheet.other,
                otherLineNames: hint?.otherLineNames,
                otherHasExtraAdditional: hint?.otherHasExtraAdditional,
                pv: sheet.pv,
                cost: sheet.cost,
                multiplier: live.sewingMultiplier,
                pricePerUnit: live.pricePerUnit,
                selling,
                profit,
                marginPercent,
              });
              const isOptimal = live.minQuantity === optimalQty;
              return (
                <tr
                  key={row.uid}
                  className={cn(
                    "border-b border-[var(--color-divider)] last:border-0",
                    rowPending
                      ? ROW_DIRTY_CLASS
                      : isOptimal
                        ? "bg-[var(--color-surface-subtle)]"
                        : "",
                  )}
                >
                  <td className={`${tdClass} text-center`}>
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-[var(--color-border)]"
                      checked={row.showOnCard}
                      title="Базовий прайс у картці «Вироби»"
                      onChange={(event) => {
                        const showOnCard = event.target.checked;
                        setRows((prev) =>
                          prev.map((item) =>
                            item.uid === row.uid ? { ...item, showOnCard } : item,
                          ),
                        );
                      }}
                    />
                  </td>
                  <td className={tdClass}>
                    <div className="flex items-center gap-1">
                      <CompactInput
                        type="text"
                        inputMode="numeric"
                        className="w-full"
                        value={draft?.minQuantity ?? String(row.minQuantity)}
                        onChange={(event) =>
                          patchDraft(row.uid, { minQuantity: event.target.value })
                        }
                      />
                      {isOptimal ? (
                        <span className="type-caption shrink-0 text-[10px] text-[var(--color-text-quiet)]">
                          опт
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className={tdClass}>
                    <div className="flex flex-col items-end gap-0.5">
                      <CompactInput
                        type="text"
                        inputMode="decimal"
                        className="w-full"
                        value={draft?.cutRate ?? String(row.cutRate)}
                        title={tips.cut}
                        onChange={(event) =>
                          patchDraft(row.uid, { cutRate: event.target.value })
                        }
                      />
                      <FormulaTip tip={tips.cut}>
                        <span className="type-caption tabular-nums text-[var(--color-text-quiet)]">
                          {formatAmountWhole(sheet.cut)}
                        </span>
                      </FormulaTip>
                    </div>
                  </td>
                  {showDeliveryColumn ? (
                    <td className={tdClass}>
                      {hasDeliveryOp ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <CompactInput
                            type="text"
                            inputMode="decimal"
                            className="w-full"
                            value={draft?.deliveryRate ?? String(row.deliveryRate)}
                            title={tips.delivery}
                            onChange={(event) =>
                              patchDraft(row.uid, { deliveryRate: event.target.value })
                            }
                          />
                          <FormulaTip tip={tips.delivery}>
                            <span className="type-caption tabular-nums text-[var(--color-text-quiet)]">
                              {formatAmountWhole(sheet.delivery)}
                            </span>
                          </FormulaTip>
                        </div>
                      ) : (
                        <MoneyCell
                          perUnit={perUnit.delivery}
                          total={sheet.delivery}
                          tip={tips.delivery}
                        />
                      )}
                    </td>
                  ) : null}
                  <td className={tdNum}>
                    <MoneyCell
                      perUnit={perUnit.materials}
                      total={sheet.materials}
                      tip={tips.materials}
                    />
                  </td>
                  <td className={tdNum}>
                    <MoneyCell perUnit={perUnit.sewing} total={sheet.sewing} tip={tips.sewing} />
                  </td>
                  <td className={tdNum}>
                    <MoneyCell perUnit={perUnit.other} total={sheet.other} tip={tips.other} />
                  </td>
                  <td className={tdNum}>
                    <MoneyCell perUnit={perUnit.pv} total={sheet.pv} tip={tips.pv} />
                  </td>
                  <td className={tdNum}>
                    <MoneyCell
                      perUnit={perUnit.cost}
                      total={sheet.cost}
                      tip={tips.cost}
                      tone="strong"
                    />
                  </td>
                  <td className={tdClass}>
                    <FormulaTip tip={tips.multiplier} className="w-full">
                      <CompactInput
                        type="text"
                        inputMode="decimal"
                        className="w-full text-center"
                        value={draft?.sewingMultiplier ?? String(row.sewingMultiplier)}
                        title={tips.multiplier}
                        onChange={(event) =>
                          patchDraft(row.uid, { sewingMultiplier: event.target.value })
                        }
                      />
                    </FormulaTip>
                  </td>
                  <td className={tdClass}>
                    <div className="flex flex-col items-end gap-0.5">
                      <FormulaTip tip={tips.price} className="w-full">
                        <CompactInput
                          type="text"
                          inputMode="decimal"
                          className="w-full font-semibold"
                          value={draft?.pricePerUnit ?? String(row.pricePerUnit)}
                          title={tips.price}
                          onChange={(event) =>
                            patchDraft(row.uid, { pricePerUnit: event.target.value })
                          }
                        />
                      </FormulaTip>
                      <FormulaTip tip={tips.selling}>
                        <span className="type-caption tabular-nums text-[var(--color-text-quiet)]">
                          {formatAmountWhole(selling)}
                        </span>
                      </FormulaTip>
                    </div>
                  </td>
                  <td className={tdNum}>
                    <MoneyCell
                      perUnit={perUnit.profit}
                      total={profit}
                      tip={tips.profit}
                      tone="strong"
                    />
                  </td>
                  <td className={tdNum}>
                    <FormulaTip tip={tips.margin}>
                      <span className="type-mono text-[12px] font-medium tabular-nums text-[var(--color-text)]">
                        {Number.isFinite(marginPercent) ? `${marginPercent.toFixed(0)}%` : "—"}
                      </span>
                    </FormulaTip>
                  </td>
                  <td className={`${tdClass} text-center`}>
                    <RowEditActions
                      dirty={rowPending}
                      onConfirm={() => confirmRowDraft(row.uid)}
                      onCancel={() => cancelRowDraft(row.uid)}
                      onRemove={rows.length > 1 ? () => removeRow(row.uid) : undefined}
                      removeLabel="Видалити тираж"
                      confirmLabel="Підтвердити рядок"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-divider)] pt-3">
        <Button type="button" variant="secondary" size="sm" onClick={addTirage}>
          Додати тираж
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setDrafts({});
            setRows((prev) =>
              spreadCutFromOptimal(
                ensureOptimalRow(
                  prev,
                  optimalQty,
                  cutRateFromOptimalJobTotal(optimalCutTotal, optimalQty, optimalQty),
                ),
                optimalCutTotal,
                optimalQty,
              ),
            );
          }}
        >
          Розкласти крій
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setDrafts({});
            setRows((prev) =>
              hydrateCommercialPriceTiers(
                prev.map((row) => ({
                  minQuantity: row.minQuantity,
                  pricePerUnit: row.pricePerUnit,
                  sewingMultiplier: row.sewingMultiplier,
                })),
                costHints,
                { force: true },
              ).map((hydrated, index) => ({
                ...prev[index]!,
                pricePerUnit: hydrated.pricePerUnit,
                sewingMultiplier: hydrated.sewingMultiplier ?? prev[index]!.sewingMultiplier,
              })),
            );
          }}
        >
          Перерахувати ціни
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            void persist();
          }}
          disabled={saving || !isDirty}
        >
          {saving
            ? "Збереження…"
            : hasDeliveryOp
              ? "Зберегти крій, доставку і прайс"
              : "Зберегти крій і прайс"}
        </Button>
        <span className="type-caption ml-auto">
          {previewQty} шт → крій {formatMoneyUah(previewCut)} · клієнту{" "}
          {formatMoneyUah(previewPrice)}
        </span>
      </div>

      {leaveOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="price-cut-leave-title"
            className="w-full max-w-md rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)]"
          >
            <p id="price-cut-leave-title" className="type-label">
              Незбережені зміни
            </p>
            <p className="type-caption mt-2 text-[var(--color-text-secondary)]">
              У таблиці є незбережені зміни. Зберегти їх перед виходом чи вийти без збереження?
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLeaveOpen(false);
                  setPendingHref(null);
                  pendingHrefRef.current = null;
                }}
              >
                Залишитись
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={discardAndLeave}>
                Вийти без змін
              </Button>
              <Button type="button" size="sm" disabled={saving} onClick={() => void saveAndLeave()}>
                {saving ? "Збереження…" : "Зберегти і вийти"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
