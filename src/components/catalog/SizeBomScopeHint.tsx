import { ALL_SIZES, type SizeScope } from "@/lib/size-bom";
import { isOversizeCode, OVERSIZE_RANGE_LABEL } from "@/lib/size-coeffs";

/**
 * Explains size tabs on the product BOM.
 * Size markups (+% for 3XL–6XL) apply only in orders when those sizes are in the tirage.
 */
export function SizeBomScopeHint({
  sizeScope,
  hasOversizeSizes,
  materialPct = 15,
  operationPct = 20,
  compact = false,
  hideUpliftPercents = false,
}: {
  sizeScope: SizeScope;
  hasOversizeSizes: boolean;
  materialPct?: number;
  operationPct?: number;
  compact?: boolean;
  /** Managers: no cost-coefficient percentages in copy. */
  hideUpliftPercents?: boolean;
}) {
  if (compact) {
    if (sizeScope === ALL_SIZES) {
      return (
        <p className="type-caption">
          База S–XL
          {hasOversizeSizes && !hideUpliftPercents
            ? ` · ${OVERSIZE_RANGE_LABEL} +${materialPct}%/+${operationPct}% лише в замовленні`
            : hasOversizeSizes
              ? ` · ${OVERSIZE_RANGE_LABEL} окремо`
              : ""}
        </p>
      );
    }
    if (isOversizeCode(sizeScope)) {
      return (
        <p className="type-caption">
          {hideUpliftPercents
            ? `${sizeScope}: норма для цього розміру.`
            : `${sizeScope}: базова норма. Націнка +${materialPct}% — у замовленні.`}
        </p>
      );
    }
    return (
      <p className="type-caption">Лише {sizeScope}. Решта — з «Усі».</p>
    );
  }

  if (sizeScope === ALL_SIZES) {
    return (
      <p className="type-caption">
        «Усі» — базові норми без націнок за розміром.
        {hasOversizeSizes && !hideUpliftPercents ? (
          <>
            {" "}
            Для {OVERSIZE_RANGE_LABEL} у замовленні автоматично матеріали +{materialPct}% і операції +
            {operationPct}% (поля справа — % для компанії). У картці виробу й «Прайс і крій» націнки не
            рахуються.
          </>
        ) : hasOversizeSizes ? (
          <> Для {OVERSIZE_RANGE_LABEL} норми задаються окремо.</>
        ) : null}{" "}
        {!hideUpliftPercents ? "Ціна матеріалу — з каталогу." : null}
      </p>
    );
  }

  if (isOversizeCode(sizeScope)) {
    return (
      <p className="type-caption">
        {hideUpliftPercents
          ? `${sizeScope}: норма на цій вкладці — лише для цього розміру.`
          : `${sizeScope}: тут базова норма (без +${materialPct}%). Націнка застосовується лише в замовленні, коли в тиражі є ${OVERSIZE_RANGE_LABEL}. Відсотки справа діють на всі вироби.`}
      </p>
    );
  }

  return (
    <p className="type-caption">
      Специфікація для {sizeScope}: норма
      {!hideUpliftPercents ? " й відходи" : ""} на цій вкладці — лише для цього розміру. Решта
      лишається на базі з «Усі».
    </p>
  );
}
