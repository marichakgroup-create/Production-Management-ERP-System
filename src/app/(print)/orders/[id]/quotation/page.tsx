import { notFound } from "next/navigation";
import { getOrder } from "@/server/domains/orders/service";
import { prisma } from "@/server/db/client";
import { getPricingForOrder } from "@/server/domains/calculation/from-entities";
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
import {
  buildQuotationSizeRows,
  quotationGrandTotal,
  quotationNeedsBaseSizeDisclaimer,
  type QuotationSnapshot,
} from "@/lib/quotation-lines";

export default async function QuotationPage({
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

  const workingItems = order.items.filter((row) => !row.superseded);

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
    })),
  }));

  const proposal = quotationProposal(proposalItems);
  if (!proposal) notFound();

  const lines = proposal.lines
    .map((line) => {
      const item = workingItems.find((row) => row.id === line.orderItemId);
      if (!item) return null;
      if (itemParam && item.id !== itemParam) return null;
      const version = item.versions.find((row) => row.id === line.id);
      if (!version) return null;
      return { item, version };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (lines.length === 0) notFound();

  const showBaseSizeDisclaimer = quotationNeedsBaseSizeDisclaimer(
    lines.map(({ item }) => ({
      sizes: item.sizes.map((size) => ({
        sizeCode: size.sizeCode,
        sizeNameUk: size.sizeNameUk,
        quantity: size.quantity,
      })),
      catalogHasSizes: (item.product?._count?.sizes ?? 0) > 0,
    })),
  );

  const tableRows = lines.flatMap(({ item, version }) => {
    const decorationSetup = item.decorations.reduce(
      (sum, row) => sum + Number(row.setupCost),
      0,
    );
    const decorationUnit = item.decorations.reduce(
      (sum, row) => sum + Number(row.unitRate),
      0,
    );
    const additionalPerUnit = item.additionalCosts
      .filter((row) => row.isPerUnit)
      .reduce((sum, row) => sum + Number(row.amount), 0);
    const additionalFixed = item.additionalCosts
      .filter((row) => !row.isPerUnit)
      .reduce((sum, row) => sum + Number(row.amount), 0);
    const fabricDelivery = Number(item.fabricDeliveryAmount ?? 0);
    const qty = Math.max(1, item.totalQuantity);
    const sharedPerUnit =
      decorationUnit +
      additionalPerUnit +
      (decorationSetup + additionalFixed + fabricDelivery) / qty;

    return buildQuotationSizeRows({
      itemKey: item.id,
      snapshot: (version.snapshotJson ?? {}) as QuotationSnapshot,
      unitPrice: Number(version.sellingPricePerUnit),
      totalSellingValue: Number(version.totalSellingValue),
      fallbackNameUk: item.nameUk,
      fallbackSizes: item.sizes.map((size) => ({
        sizeCode: size.sizeCode,
        sizeNameUk: size.sizeNameUk,
        quantity: size.quantity,
      })),
      fallbackDecorations: item.decorations.map((row) => ({ nameSnapshot: row.nameSnapshot })),
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
      sharedPerUnit,
    });
  });

  const grandTotal = quotationGrandTotal(lines);
  const notes = proposal.comment ?? "";
  const companyName = company?.legalName ?? "Виробнича компанія";
  const companyLines = [
    company?.address,
    [company?.phone, company?.email].filter(Boolean).join(" · ") || null,
    company?.taxId ? `ЄДРПОУ / ІПН: ${company.taxId}` : null,
  ].filter((line): line is string => Boolean(line));

  const docMeta = [
    `від ${formatDateUk(proposal.createdAt)}`,
    proposal.revision != null
      ? `пропозиція v${proposal.revision}${proposal.isApproved ? " · погоджено" : " · проєкт"}`
      : `${tableRows.length} ряд.`,
  ];

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
                  {order.client.contactPerson ? <p>{order.client.contactPerson}</p> : null}
                  {order.client.phone ? <PrintDocMuted>{order.client.phone}</PrintDocMuted> : null}
                  {order.client.email ? <PrintDocMuted>{order.client.email}</PrintDocMuted> : null}
                </>
              ),
            },
            {
              label: "Умови",
              content: (
                <>
                  <p>
                    Менеджер: <strong>{order.manager.name}</strong>
                  </p>
                  <p>Термін виконання: {formatDateUk(order.deadline)}</p>
                  <PrintDocMuted>Ціни дійсні на дату формування пропозиції</PrintDocMuted>
                </>
              ),
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
