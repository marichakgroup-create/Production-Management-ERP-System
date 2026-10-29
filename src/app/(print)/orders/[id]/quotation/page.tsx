import { notFound } from "next/navigation";
import { getOrder } from "@/server/domains/orders/service";
import { prisma } from "@/server/db/client";
import {
  buildCalcFromOrderItem,
  calcOptionsFromProduct,
  getPricingForOrder,
} from "@/server/domains/calculation/from-entities";
import { fixedCostOptionsFromDb } from "@/server/domains/fixed-costs/service";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import {
  PrintDocFooter,
  PrintDocHeader,
  PrintDocMeta,
  PrintDocMuted,
  PrintDocNotes,
  PrintDocSection,
  PrintDocTable,
  PrintDocument,
} from "@/components/print/PrintDocument";
import { formatDateUk, formatMoneyUah } from "@/lib/utils";
import { quotationProposal } from "@/lib/order-proposals";
import { draftLineFromItem } from "@/lib/order-item-commercial";
import {
  buildQuotationSizeRows,
  quotationNeedsBaseSizeDisclaimer,
  type QuotationSnapshot,
} from "@/lib/quotation-lines";

/** After handover, КП is a frozen snapshot; before that — always live from the order. */
function isQuotationFrozen(status: string) {
  return status === "HANDED_TO_PRODUCTION" || status === "CLOSED";
}

export default async function QuotationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ item?: string }>;
}) {
  const { id } = await params;
  const { item: itemParam } = await searchParams;
  const [order, company, pricing, fixedCosts] = await Promise.all([
    getOrder(id),
    prisma.companySettings.findFirst(),
    getPricingForOrder(id),
    fixedCostOptionsFromDb(),
  ]);
  if (!order) notFound();

  const workingItems = order.items.filter((row) => !row.superseded);
  const scopedItems = itemParam
    ? workingItems.filter((row) => row.id === itemParam)
    : workingItems;
  if (scopedItems.length === 0) notFound();

  const frozen = isQuotationFrozen(order.status);

  type PricedLine = {
    item: (typeof scopedItems)[number];
    unitPrice: number;
    totalSellingValue: number;
    snapshot: QuotationSnapshot;
  };

  let pricedLines: PricedLine[] = [];
  let notes = "";
  let docMeta: string[] = [];

  if (frozen) {
    const proposalItems = order.items.map((row) => ({
      id: row.id,
      nameUk: row.nameUk,
      totalQuantity: row.totalQuantity,
      superseded: row.superseded,
      versions: row.versions.map((version) => ({
        id: version.id,
        orderItemId: row.id,
        versionNumber: version.versionNumber,
        label: version.label,
        comment: version.comment,
        isApproved: version.isApproved,
        createdAt: version.createdAt,
        proposalRevision: version.proposalRevision,
        proposalLabel: version.proposalLabel,
        sellingPricePerUnit: version.sellingPricePerUnit,
        totalSellingValue: version.totalSellingValue,
        marginPercent: version.marginPercent,
        costPerUnit: version.costPerUnit,
        author: version.author,
        snapshotJson: version.snapshotJson,
      })),
    }));

    const proposal = quotationProposal(proposalItems);
    if (!proposal) notFound();

    pricedLines = proposal.lines
      .map((line) => {
        const item = scopedItems.find((row) => row.id === line.orderItemId);
        if (!item) return null;
        const version = item.versions.find((row) => row.id === line.id);
        if (!version) return null;
        return {
          item,
          unitPrice: Number(version.sellingPricePerUnit),
          totalSellingValue: Number(version.totalSellingValue),
          snapshot: (version.snapshotJson ?? {}) as QuotationSnapshot,
        };
      })
      .filter((row): row is PricedLine => Boolean(row));

    if (pricedLines.length === 0) notFound();

    notes = proposal.comment ?? "";
    docMeta = [
      `від ${formatDateUk(proposal.createdAt)}`,
      proposal.revision != null
        ? `пропозиція v${proposal.revision}${proposal.isApproved ? " · погоджено" : ""} · зафіксовано`
        : "зафіксовано",
    ];
  } else {
    pricedLines = scopedItems
      .filter((item) => item.totalQuantity > 0)
      .map((item) => {
        const lineCalc = buildCalcFromOrderItem(item, pricing, {
          ...calcOptionsFromProduct(item.product),
          fixedCosts,
        });
        const draft = draftLineFromItem(item, lineCalc);
        return {
          item,
          unitPrice: draft.sellingPricePerUnit,
          totalSellingValue: draft.totalSellingValue,
          snapshot: {
            item: {
              nameUk: item.nameUk,
              totalQuantity: item.totalQuantity,
              sizes: item.sizes.map((size) => ({
                sizeCode: size.sizeCode,
                sizeNameUk: size.sizeNameUk,
                quantity: size.quantity,
              })),
              decorations: item.decorations.map((row) => ({
                nameSnapshot: row.nameSnapshot,
              })),
            },
          },
        };
      });

    if (pricedLines.length === 0) notFound();

    docMeta = [
      `на ${formatDateUk(new Date())}`,
      "за поточним складом замовлення",
    ];
  }

  const showBaseSizeDisclaimer = quotationNeedsBaseSizeDisclaimer(
    pricedLines.map(({ item }) => ({
      sizes: item.sizes.map((size) => ({
        sizeCode: size.sizeCode,
        sizeNameUk: size.sizeNameUk,
        quantity: size.quantity,
      })),
      catalogHasSizes: (item.product?._count?.sizes ?? 0) > 0,
    })),
  );

  const tableRows = pricedLines.flatMap(({ item, unitPrice, totalSellingValue, snapshot }) =>
    buildQuotationSizeRows({
      itemKey: item.id,
      snapshot,
      unitPrice,
      totalSellingValue,
      fallbackNameUk: item.nameUk,
      fallbackSizes: item.sizes.map((size) => ({
        sizeCode: size.sizeCode,
        sizeNameUk: size.sizeNameUk,
        quantity: size.quantity,
      })),
      fallbackDecorations: item.decorations.map((row) => ({
        nameSnapshot: row.nameSnapshot,
      })),
      fallbackTotalQuantity: item.totalQuantity,
      materials: item.materials.map((row) => ({
        sizeCode: row.sizeCode,
        nameSnapshot: row.nameSnapshot,
        materialId: row.materialId,
        consumptionPerUnit: Number(row.consumptionPerUnit),
        wastePercent: Number(row.wastePercent),
        purchasePrice: Number(row.purchasePrice),
      })),
      operations: item.operations.map((row) => ({
        sizeCode: row.sizeCode,
        nameSnapshot: row.nameSnapshot,
        operationId: row.operationId,
        unitRate: row.unitRate != null ? Number(row.unitRate) : null,
      })),
      sizeRules: pricing.sizeRules,
    }),
  );

  const grandTotal = pricedLines.reduce((sum, row) => sum + row.totalSellingValue, 0);
  const companyName = company?.legalName ?? "Виробнича компанія";
  const companyLines = [
    company?.address,
    [company?.phone, company?.email].filter(Boolean).join(" · ") || null,
    company?.taxId ? `ЄДРПОУ / ІПН: ${company.taxId}` : null,
  ].filter((line): line is string => Boolean(line));

  const runningTitle = `КП ${order.number} · ${companyName}`;

  return (
    <>
      <PrintToolbar
        backHref={`/orders/${order.id}?tab=files`}
        title={`Комерційна пропозиція ${order.number}`}
      />

      <PrintDocument runningTitle={runningTitle}>
        <PrintDocHeader
          companyName={companyName}
          companyLines={companyLines}
          docType="Комерційна пропозиція"
          docNumber={order.number}
          docMeta={docMeta}
        />

        <PrintDocMeta
          columns={[
            {
              label: "Замовник",
              content: (
                <>
                  <p>
                    <strong>{order.client.companyName}</strong>
                  </p>
                  {(order.clientContact?.nameUk || order.client.contactPerson) ? (
                    <p>{order.clientContact?.nameUk || order.client.contactPerson}</p>
                  ) : null}
                  {order.clientContact?.roleUk?.trim() ? (
                    <PrintDocMuted>{order.clientContact.roleUk.trim()}</PrintDocMuted>
                  ) : null}
                  {(order.clientContact?.phone || order.client.phone) ? (
                    <PrintDocMuted>
                      {order.clientContact?.phone || order.client.phone}
                    </PrintDocMuted>
                  ) : null}
                  {(order.clientContact?.email || order.client.email) ? (
                    <PrintDocMuted>
                      {order.clientContact?.email || order.client.email}
                    </PrintDocMuted>
                  ) : null}
                </>
              ),
            },
            {
              label: "Умови",
              content: <p>Термін виконання: {formatDateUk(order.deadline)}</p>,
            },
          ]}
        />

        {showBaseSizeDisclaimer ? (
          <p className="print-doc-scope-banner">
            Розрахунок для базових моделей — розміри XS–XXL.
            <br />
            <span className="print-doc-scope-banner-sub">
              Крупні розміри (3XL+) уточнюються перед виробництвом і можуть змінити вартість.
            </span>
          </p>
        ) : null}

        <PrintDocSection title="Позиції замовлення" breakable>
          <PrintDocTable
            head={
              <tr>
                <th>Найменування</th>
                <th>Розмір</th>
                <th className="num">Кількість</th>
                <th className="num">Ціна за од.</th>
                <th className="num">Сума</th>
              </tr>
            }
            rows={
              <>
                {tableRows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <strong>{row.nameUk}</strong>
                      {row.decorationsLabel ? (
                        <span className="print-doc-item-sub">{row.decorationsLabel}</span>
                      ) : null}
                    </td>
                    <td>{row.sizeNameUk ?? "—"}</td>
                    <td className="num">{row.quantity} шт</td>
                    <td className="num">{formatMoneyUah(row.unitPrice)}</td>
                    <td className="num">
                      <strong>{formatMoneyUah(row.lineTotal)}</strong>
                    </td>
                  </tr>
                ))}
              </>
            }
            foot={
              <tr>
                <td colSpan={4} className="num">
                  Разом до сплати
                </td>
                <td className="num print-doc-total-value">{formatMoneyUah(grandTotal)}</td>
              </tr>
            }
          />
        </PrintDocSection>

        {notes ? <PrintDocNotes>{notes}</PrintDocNotes> : null}

        <PrintDocFooter>
          {company?.quotationFooter ??
            "Пропозиція не є публічною офертою. Остаточні умови фіксуються договором."}
        </PrintDocFooter>
      </PrintDocument>
    </>
  );
}
