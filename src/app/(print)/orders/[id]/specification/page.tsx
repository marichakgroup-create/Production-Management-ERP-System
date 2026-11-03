import { notFound } from "next/navigation";
import { getOrder } from "@/server/domains/orders/service";
import { resolveCompanySettings } from "@/server/domains/settings/company";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import {
  PrintDocHeader,
  PrintDocMeta,
  PrintDocMuted,
  PrintDocSection,
  PrintDocSignatures,
  PrintDocTable,
  PrintDocument,
} from "@/components/print/PrintDocument";
import { formatDateUk, formatUnit } from "@/lib/utils";
import { lineNeedOnSizes } from "@/lib/size-bom";
import {
  fabricFieldsForOrderLine,
  materialToSnapshot,
  offerToSnapshot,
  pickSupplierOffer,
} from "@/lib/order-material-terms";
import { operationMethodLabel } from "@/lib/operation-labels";
import { isOversizeCode, OVERSIZE_RANGE_LABEL, oversizeUpliftCaption } from "@/lib/size-coeffs";
import { getPricingForOrder } from "@/server/domains/calculation/from-entities";
import { displayScreenPrintLineName } from "@/lib/screen-print-pricing";
import { isMiscDecorationCostName } from "@/lib/decoration-format-pricing";
import { richTextIsEmpty, sanitizeRichHtml } from "@/lib/rich-text";

type SpecMaterial = {
  nameSnapshot: string;
  unitCodeSnapshot: string;
  consumptionPerUnit: string | number;
  wastePercent: string | number;
  sizeCode?: string | null;
  materialId?: string | null;
  supplierId?: string | null;
  colorSnapshot?: string | null;
  supplierNameSnapshot?: string | null;
  /** м/кг for the chosen supplier offer, else the material card. */
  metersPerKg?: number | null;
  /** Gray line under the name: density, composition, width, м/кг. */
  traits?: string | null;
};

type KgSource = {
  type?: string | null;
  densityGsm?: string | null;
  composition?: string | null;
  fabricKindUk?: string | null;
  widthCm?: string | null;
  colorOrAttribute?: string | null;
  purchasePrice?: { toString(): string } | number | null;
  metersPerKg?: { toString(): string } | number | null;
  priceKgUsd?: { toString(): string } | number | null;
  priceKgUsdCargo?: { toString(): string } | number | null;
  priceMeterUahNoVat?: { toString(): string } | number | null;
  priceMeterUahVat?: { toString(): string } | number | null;
  priceMeterUahCutVat?: { toString(): string } | number | null;
  metersPerRoll?: { toString(): string } | number | null;
  minWholesaleMeters?: { toString(): string } | number | null;
  supplierOffers?: Array<{
    supplierId: string;
    isPrimary?: boolean;
    metersPerKg?: { toString(): string } | number | null;
    priceKgUsd?: { toString(): string } | number | null;
    priceKgUsdCargo?: { toString(): string } | number | null;
    priceKgUsdVat?: { toString(): string } | number | null;
    priceMeterUahNoVat?: { toString(): string } | number | null;
    priceMeterUahVat?: { toString(): string } | number | null;
    priceMeterUahCutVat?: { toString(): string } | number | null;
    metersPerRoll?: { toString(): string } | number | null;
    minWholesaleMeters?: { toString(): string } | number | null;
    cargoUsdPerKg?: { toString(): string } | number | null;
  }>;
};

type SpecOperation = {
  nameSnapshot: string;
  calculationMethod?: string;
  sizeCode?: string | null;
};

type SpecDecoration = {
  nameSnapshot: string;
};

type SpecSize = {
  sizeCode?: string;
  sizeNameUk: string;
  quantity: number;
};

type SpecSnapshot = {
  item?: {
    nameUk?: string;
    totalQuantity?: number;
    sizes?: SpecSize[];
    materials?: SpecMaterial[];
    operations?: SpecOperation[];
    decorations?: SpecDecoration[];
  };
};

function liveSpecFromItem(item: {
  nameUk: string;
  totalQuantity: number;
  sizes: SpecSize[];
  materials: Array<{
    nameSnapshot: string;
    unitCodeSnapshot: string;
    consumptionPerUnit: unknown;
    wastePercent: unknown;
    sizeCode?: string | null;
    materialId?: string | null;
    supplierId?: string | null;
    colorSnapshot?: string | null;
    supplierNameSnapshot?: string | null;
    material?: KgSource | null;
  }>;
  operations: Array<{
    nameSnapshot: string;
    calculationMethod?: string;
    sizeCode?: string | null;
  }>;
  decorations: Array<{ nameSnapshot: string }>;
}): NonNullable<SpecSnapshot["item"]> {
  return {
    nameUk: item.nameUk,
    totalQuantity: item.totalQuantity,
    sizes: item.sizes,
    materials: item.materials.map((row) => ({
      nameSnapshot: row.nameSnapshot,
      unitCodeSnapshot: row.unitCodeSnapshot,
      consumptionPerUnit: Number(row.consumptionPerUnit),
      wastePercent: Number(row.wastePercent),
      sizeCode: row.sizeCode,
      materialId: row.materialId,
      supplierId: row.supplierId,
      colorSnapshot: row.colorSnapshot,
      supplierNameSnapshot: row.supplierNameSnapshot,
      metersPerKg: metersPerKgFromCatalog(row.material, row.supplierId),
      traits: materialTraits(
        row.material,
        metersPerKgFromCatalog(row.material, row.supplierId),
      ),
    })),
    operations: item.operations.map((row) => ({
      nameSnapshot: row.nameSnapshot,
      calculationMethod: row.calculationMethod,
      sizeCode: row.sizeCode,
    })),
    decorations: item.decorations
      .filter((row) => !isMiscDecorationCostName(row.nameSnapshot))
      .map((row) => ({ nameSnapshot: row.nameSnapshot })),
  };
}

type SizeRule = { sizeCode: string; materialCoeff: number; operationCoeff: number };

function metersPerKgFromCatalog(
  material: KgSource | null | undefined,
  supplierId?: string | null,
): number | null {
  if (!material) return null;
  const offer = pickSupplierOffer(material.supplierOffers, supplierId);
  const merged = fabricFieldsForOrderLine(
    materialToSnapshot({
      ...material,
      purchasePrice: material.purchasePrice ?? 0,
    }),
    offer ? offerToSnapshot(offer) : null,
  );
  const metersPerKg = merged.metersPerKg;
  return metersPerKg != null && metersPerKg > 0 ? metersPerKg : null;
}

function formatDensity(value?: string | null): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return /г\/м/i.test(trimmed) ? trimmed : `${trimmed} г/м²`;
}

function formatWidth(value?: string | null): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  if (/см/i.test(trimmed)) return trimmed;
  return `${trimmed} см`;
}

function materialTraits(
  material: KgSource | null | undefined,
  metersPerKg: number | null,
): string | null {
  if (!material || material.type !== "FABRIC") return null;
  const meters =
    metersPerKg != null && metersPerKg > 0
      ? `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(metersPerKg)} м/кг`
      : null;
  const parts = [
    material.fabricKindUk?.replace(/\s+/g, " ").trim() || null,
    formatDensity(material.densityGsm),
    material.composition?.replace(/\s+/g, " ").trim() || null,
    formatWidth(material.widthCm),
    meters,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Purchase weight when the line is in meters and the material card has м/кг. */
function purchaseKg(need: number, material: SpecMaterial): number | null {
  if (material.unitCodeSnapshot !== "m") return null;
  const metersPerKg = material.metersPerKg;
  if (metersPerKg == null || metersPerKg <= 0 || !(need > 0)) return null;
  return Math.round((need / metersPerKg) * 10) / 10;
}

function withPurchaseKg<T extends SpecMaterial & { material?: KgSource | null }>(
  materials: T[],
  live: Array<{
    nameSnapshot: string;
    materialId?: string | null;
    supplierId?: string | null;
    sizeCode?: string | null;
    material?: KgSource | null;
  }>,
): SpecMaterial[] {
  return materials.map((row) => {
    const match = live.find(
      (line) =>
        (row.materialId != null &&
          line.materialId === row.materialId &&
          (row.supplierId == null || line.supplierId === row.supplierId) &&
          (row.sizeCode ?? null) === (line.sizeCode ?? null)) ||
        (line.nameSnapshot === row.nameSnapshot &&
          (row.sizeCode ?? null) === (line.sizeCode ?? null)),
    );
    const source = match?.material ?? row.material;
    const supplierId = row.supplierId ?? match?.supplierId;
    const metersPerKg =
      row.metersPerKg != null && row.metersPerKg > 0
        ? row.metersPerKg
        : metersPerKgFromCatalog(source, supplierId);
    return {
      ...row,
      metersPerKg,
      traits: row.traits?.trim() || materialTraits(source, metersPerKg),
    };
  });
}

function formatKg(value: number): string {
  return `${new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)} кг`;
}

function materialNeed(
  material: SpecMaterial,
  index: number,
  materials: SpecMaterial[],
  sizes: SpecSize[],
  sizeRules?: SizeRule[] | null,
) {
  const consumption = Number(material.consumptionPerUnit);
  const waste = Number(material.wastePercent);
  const siblings = materials.map((row, rowIndex) => ({
    id: String(rowIndex),
    groupKey: row.materialId ?? row.nameSnapshot,
    sizeCode: row.sizeCode ?? null,
  }));
  return lineNeedOnSizes(
    {
      id: String(index),
      groupKey: material.materialId ?? material.nameSnapshot,
      sizeCode: material.sizeCode ?? null,
      consumption,
      waste,
      applySizeCoeff: !(material.sizeCode != null && isOversizeCode(material.sizeCode)),
    },
    siblings,
    sizes.map((size) => ({
      sizeCode: size.sizeCode ?? "",
      quantity: size.quantity,
    })),
    sizeRules,
  );
}

function SpecProductBlock({
  index,
  total,
  nameUk,
  quantity,
  frozenAt,
  sizes,
  materials,
  operations,
  decorations,
  artworkFiles,
  sizeRules,
}: {
  index: number;
  total: number;
  nameUk: string;
  quantity: number;
  frozenAt?: Date | null;
  sizes: SpecSize[];
  materials: SpecMaterial[];
  operations: SpecOperation[];
  decorations: SpecDecoration[];
  artworkFiles: Array<{ id: string; fileName: string }>;
  sizeRules?: SizeRule[] | null;
}) {
  const hasOversize = sizes.some((size) => isOversizeCode(size.sizeCode));
  return (
    <section className={total > 1 ? "print-doc-product" : undefined}>
      {total > 1 ? (
        <p className="print-doc-product-kicker">
          Позиція {index} з {total}
          {frozenAt ? ` · зафіксовано ${formatDateUk(frozenAt)}` : ""}
        </p>
      ) : null}
      <h2 className="print-doc-product-title">
        {nameUk}
        <span className="print-doc-meta-muted"> · {quantity} шт</span>
      </h2>

      <PrintDocSection title="Розмірна сітка">
        {sizes.length === 0 ? (
          <PrintDocMuted>Без розмірної сітки — {quantity} шт</PrintDocMuted>
        ) : (
          <PrintDocTable
            head={
              <tr>
                {sizes.map((size) => (
                  <th key={size.sizeCode ?? size.sizeNameUk} className="num">
                    {size.sizeCode ?? size.sizeNameUk}
                  </th>
                ))}
                <th className="num">Разом</th>
              </tr>
            }
            rows={
              <tr>
                {sizes.map((size) => (
                  <td key={size.sizeCode ?? size.sizeNameUk} className="num">
                    <strong>{size.quantity}</strong>
                  </td>
                ))}
                <td className="num">
                  <strong>{quantity}</strong>
                </td>
              </tr>
            }
          />
        )}
      </PrintDocSection>

      <PrintDocSection title="Матеріали — що видати на партію" breakable>
        {hasOversize ? (
          <PrintDocMuted>
            У потребі вже враховано {oversizeUpliftCaption(sizeRules)} на частку {OVERSIZE_RANGE_LABEL}.
          </PrintDocMuted>
        ) : null}
        {materials.length === 0 ? (
          <PrintDocMuted>Матеріалів немає</PrintDocMuted>
        ) : (
          <PrintDocTable
            head={
              <tr>
                <th>Матеріал</th>
                <th>Колір</th>
                <th>Постачальник</th>
                <th className="num">Норма</th>
                <th className="num">Відх.</th>
                <th className="num">Потреба</th>
                {materials.some((row) => row.unitCodeSnapshot === "m") ? (
                  <th className="num">кг</th>
                ) : null}
              </tr>
            }
            rows={
              <>
                {materials.map((material, materialIndex) => {
                  const consumption = Number(material.consumptionPerUnit);
                  const waste = Number(material.wastePercent);
                  const need = materialNeed(material, materialIndex, materials, sizes, sizeRules);
                  const unit = formatUnit(material.unitCodeSnapshot);
                  const kg = purchaseKg(need, material);
                  const showKg = materials.some((row) => row.unitCodeSnapshot === "m");
                  return (
                    <tr key={`${material.nameSnapshot}-${materialIndex}`}>
                      <td>
                        <strong>{material.nameSnapshot}</strong>
                        {material.traits ? (
                          <span className="print-doc-item-sub">{material.traits}</span>
                        ) : null}
                        {material.sizeCode ? (
                          <span className="print-doc-item-sub">лише {material.sizeCode}</span>
                        ) : null}
                      </td>
                      <td>{material.colorSnapshot?.trim() || "—"}</td>
                      <td>{material.supplierNameSnapshot?.trim() || "—"}</td>
                      <td className="num">
                        {consumption} {unit}
                      </td>
                      <td className="num">{waste > 0 ? `${waste}%` : "—"}</td>
                      <td className="num">
                        <strong>
                          {need.toFixed(need >= 10 ? 2 : 3)} {unit}
                        </strong>
                      </td>
                      {showKg ? (
                        <td className="num">
                          <strong>{kg != null ? formatKg(kg) : "—"}</strong>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </>
            }
          />
        )}
      </PrintDocSection>

      <PrintDocSection title="Технологічні операції">
        {operations.length === 0 ? (
          <PrintDocMuted>Операцій немає</PrintDocMuted>
        ) : (
          <ol className="print-doc-list print-doc-list--shop">
            {operations.map((operation, operationIndex) => (
              <li key={`${operation.nameSnapshot}-${operationIndex}`}>
                <span className="print-doc-op-name">{operation.nameSnapshot}</span>
                {operation.sizeCode ? (
                  <span className="print-doc-item-sub"> {operation.sizeCode}</span>
                ) : null}
                {operation.calculationMethod ? (
                  <span className="print-doc-op-method">
                    {" "}
                    · {operationMethodLabel(operation.calculationMethod)}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </PrintDocSection>

      <PrintDocSection title="Нанесення / брендування">
        {decorations.length === 0 ? (
          <PrintDocMuted>Без нанесення</PrintDocMuted>
        ) : (
          <ul className="print-doc-list-plain print-doc-list--shop">
            {decorations.map((decoration, decorationIndex) => (
              <li key={`${decoration.nameSnapshot}-${decorationIndex}`}>
                <strong>{displayScreenPrintLineName(decoration.nameSnapshot)}</strong>
                <span className="print-doc-op-method"> · за макетом</span>
              </li>
            ))}
          </ul>
        )}
      </PrintDocSection>

      <PrintDocSection title="Файли макетів">
        {artworkFiles.length === 0 ? (
          <PrintDocMuted>
            {decorations.length > 0
              ? "Макетів у цій позиції немає — перевірте вкладку файлів"
              : "Не потрібні"}
          </PrintDocMuted>
        ) : (
          <ul className="print-doc-list-plain print-doc-list--shop">
            {artworkFiles.map((file) => (
              <li key={file.id}>{file.fileName}</li>
            ))}
          </ul>
        )}
      </PrintDocSection>
    </section>
  );
}

export default async function SpecificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ item?: string }>;
}) {
  const { id } = await params;
  const { item: itemParam } = await searchParams;
  const [order, pricing] = await Promise.all([
    getOrder(id),
    getPricingForOrder(id),
  ]);
  if (!order) notFound();
  const company =
    order.companySettings ?? (await resolveCompanySettings(order.companySettingsId));

  const workingItems = order.items.filter((row) => !row.superseded);
  const scopedItems = itemParam
    ? workingItems.filter((row) => row.id === itemParam)
    : workingItems;
  const items = scopedItems.length > 0 ? scopedItems : workingItems;
  if (items.length === 0) notFound();

  const sizeRules = pricing.sizeRules;
  const companyName = company?.legalName ?? "Виробнича компанія";
  const companyLines = [
    company?.address,
    [company?.phone, company?.email].filter(Boolean).join(" · ") || null,
    company?.taxId ? `ЄДРПОУ / ІПН: ${company.taxId}` : null,
    company?.iban ? `IBAN: ${company.iban}` : null,
  ].filter((line): line is string => Boolean(line));
  const totalQuantity = items.reduce((sum, row) => sum + row.totalQuantity, 0);
  const allFrozen = items.every((row) => Boolean(row.specification));
  const anyFrozen = items.some((row) => Boolean(row.specification));
  const frozenAt = items
    .map((row) => row.specification?.lockedAt)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const runningTitle = `Цех · ${order.number}${items.length === 1 ? ` · ${items[0]!.nameUk}` : ` · ${items.length} поз.`}`;

  return (
    <>
      <PrintToolbar
        backHref={`/orders/${order.id}?tab=files`}
        title={`Специфікація ${order.number}`}
      />

      <PrintDocument runningTitle={runningTitle} className="print-doc--shop">
        <PrintDocHeader
          companyName={companyName}
          companyLines={companyLines.length > 0 ? companyLines : undefined}
          docType="Завдання в цех"
          docNumber={order.number}
          docMeta={[
            items.length === 1 ? (items[0]!.nameUk) : `${items.length} позиції`,
            ...(allFrozen && frozenAt
              ? [`Зафіксовано ${formatDateUk(frozenAt)}`, "Незмінний знімок"]
              : anyFrozen
                ? [formatDateUk(new Date()), "Частково зафіксовано"]
                : [formatDateUk(new Date()), "За поточним складом"]),
          ]}
        />

        <PrintDocMeta
          cols={3}
          columns={[
            {
              label: "Клієнт",
              content: (
                <p>
                  <strong>{order.client.companyName}</strong>
                  {order.title ? <span className="print-doc-meta-muted"> · {order.title}</span> : null}
                </p>
              ),
            },
            {
              label: "Термін",
              content: (
                <p>
                  <strong>{formatDateUk(order.deadline)}</strong>
                </p>
              ),
            },
            {
              label: "Тираж",
              content: (
                <p>
                  <strong>{totalQuantity} шт</strong>
                  {items.length > 1 ? (
                    <span className="print-doc-meta-muted"> · {items.length} поз.</span>
                  ) : null}
                </p>
              ),
            },
          ]}
        />

        {!richTextIsEmpty(order.comment) ? (
          <PrintDocSection title="Коментар до замовлення">
            <div
              className="print-doc-rich"
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(order.comment) }}
            />
          </PrintDocSection>
        ) : null}

        {items.length > 1 ? (
          <PrintDocSection title="Позиції замовлення">
            <PrintDocTable
              head={
                <tr>
                  <th className="num">№</th>
                  <th>Виріб</th>
                  <th className="num">Тираж</th>
                </tr>
              }
              rows={
                <>
                  {items.map((row, index) => (
                    <tr key={row.id}>
                      <td className="num">{index + 1}</td>
                      <td>
                        <strong>{row.nameUk}</strong>
                      </td>
                      <td className="num">{row.totalQuantity} шт</td>
                    </tr>
                  ))}
                </>
              }
              foot={
                <tr>
                  <td colSpan={2} className="num">
                    Разом
                  </td>
                  <td className="num">
                    <strong>{totalQuantity} шт</strong>
                  </td>
                </tr>
              }
            />
          </PrintDocSection>
        ) : null}

        {items.map((item, index) => {
          const specification = item.specification;
          const frozen = Boolean(specification);
          const snap = frozen
            ? ((specification?.snapshotJson as SpecSnapshot | undefined)?.item ?? {})
            : liveSpecFromItem(item);
          const decorationIds = new Set(item.decorations.map((row) => row.id));
          const artworkFiles = order.files.filter(
            (file) =>
              file.orderItemId === item.id ||
              (file.orderItemDecorationId != null && decorationIds.has(file.orderItemDecorationId)),
          );
          return (
            <SpecProductBlock
              key={item.id}
              index={index + 1}
              total={items.length}
              nameUk={snap.nameUk ?? item.nameUk}
              quantity={snap.totalQuantity ?? item.totalQuantity}
              frozenAt={specification?.lockedAt ?? null}
              sizes={(snap.sizes ?? []).filter((row) => row.quantity > 0)}
              materials={withPurchaseKg(snap.materials ?? [], item.materials)}
              operations={snap.operations ?? []}
              decorations={snap.decorations ?? []}
              artworkFiles={artworkFiles}
              sizeRules={sizeRules}
            />
          );
        })}

        <PrintDocSection>
          <div className="print-doc-summary print-doc-summary--shop">
            <div>
              <p className="print-doc-label">Контроль цеху</p>
              <p className="print-doc-shop-check">☐ Крій &nbsp; ☐ Пошив &nbsp; ☐ Нанесення &nbsp; ☐ ОТК</p>
              <PrintDocMuted>
                Менеджер: {order.manager.name}
                {(order.clientContact?.nameUk || order.client.contactPerson)
                  ? ` · контакт клієнта: ${order.clientContact?.nameUk || order.client.contactPerson}${
                      order.clientContact?.roleUk?.trim()
                        ? ` (${order.clientContact.roleUk.trim()})`
                        : ""
                    }`
                  : ""}
              </PrintDocMuted>
            </div>
            <PrintDocSignatures
              items={[{ label: "Видав (менеджер)" }, { label: "Прийняв (цех)" }]}
            />
          </div>
        </PrintDocSection>
      </PrintDocument>
    </>
  );
}
