import { notFound } from "next/navigation";
import { getOrder } from "@/server/domains/orders/service";
import { prisma } from "@/server/db/client";
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
import { operationMethodLabel } from "@/lib/operation-labels";
import { isOversizeCode, OVERSIZE_RANGE_LABEL, oversizeUpliftCaption } from "@/lib/size-coeffs";
import { getPricingForOrder } from "@/server/domains/calculation/from-entities";
import { displayScreenPrintLineName } from "@/lib/screen-print-pricing";

type SpecMaterial = {
  nameSnapshot: string;
  unitCodeSnapshot: string;
  consumptionPerUnit: string | number;
  wastePercent: string | number;
  sizeCode?: string | null;
  materialId?: string | null;
  colorSnapshot?: string | null;
  supplierNameSnapshot?: string | null;
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

function materialNeed(
  material: SpecMaterial,
  index: number,
  materials: SpecMaterial[],
  sizes: SpecSize[],
  sizeRules?: Array<{ sizeCode: string; materialCoeff: number; operationCoeff: number }> | null,
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

export default async function SpecificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ item?: string }>;
}) {
  const { id } = await params;
  const { item: itemParam } = await searchParams;
  const [order, company, pricing] = await Promise.all([
    getOrder(id),
    prisma.companySettings.findFirst(),
    getPricingForOrder(id),
  ]);
  if (!order) notFound();

  const item =
    (itemParam ? order.items.find((row) => row.id === itemParam) : null) ??
    order.items.find((row) => row.specification) ??
    order.items[0];
  const specification = item?.specification;
  if (!item || !specification) notFound();

  const snapshot = specification.snapshotJson as SpecSnapshot;
  const snap = snapshot?.item ?? {};
  const materials = snap.materials ?? [];
  const operations = snap.operations ?? [];
  const decorations = snap.decorations ?? [];
  const sizes = (snap.sizes ?? []).filter((row) => row.quantity > 0);
  const quantity = snap.totalQuantity ?? item.totalQuantity;
  const hasOversize = sizes.some((size) => isOversizeCode(size.sizeCode));
  const sizeRules = pricing.sizeRules;
  const companyName = company?.legalName ?? "Виробнича компанія";
  const productName = snap.nameUk ?? item.nameUk;
  const lockedVersion = item.versions.find((row) => row.id === specification.calculationVersionId);
  const versionLabel = lockedVersion
    ? `v${lockedVersion.versionNumber}${lockedVersion.proposalRevision != null ? ` · пропозиція ${lockedVersion.proposalRevision}` : ""}`
    : null;
  const runningTitle = `Цех · ${order.number} · ${productName}`;
  const companyLines = [company?.address, company?.phone].filter((line): line is string =>
    Boolean(line),
  );
  const artworkFiles = order.files;
  const multiItem = order.items.length > 1;

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
            productName,
            `Зафіксовано ${formatDateUk(specification.lockedAt)}`,
            versionLabel ?? "Незмінний знімок",
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
                  <strong>{quantity} шт</strong>
                  {multiItem ? (
                    <span className="print-doc-meta-muted">
                      {" "}
                      · поз. {order.items.findIndex((row) => row.id === item.id) + 1}/
                      {order.items.length}
                    </span>
                  ) : null}
                </p>
              ),
            },
          ]}
        />

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
            <PrintDocMuted>Матеріалів у знімку немає</PrintDocMuted>
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
                </tr>
              }
              rows={
                <>
                  {materials.map((material, index) => {
                    const consumption = Number(material.consumptionPerUnit);
                    const waste = Number(material.wastePercent);
                    const need = materialNeed(material, index, materials, sizes, sizeRules);
                    const unit = formatUnit(material.unitCodeSnapshot);
                    return (
                      <tr key={`${material.nameSnapshot}-${index}`}>
                        <td>
                          <strong>{material.nameSnapshot}</strong>
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
              {operations.map((operation, index) => (
                <li key={`${operation.nameSnapshot}-${index}`}>
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
              {decorations.map((decoration, index) => (
                <li key={`${decoration.nameSnapshot}-${index}`}>
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
                ? "Макетів у замовленні немає — перевірте вкладку файлів"
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
