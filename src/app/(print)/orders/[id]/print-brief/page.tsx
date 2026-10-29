import { notFound } from "next/navigation";
import { getOrder } from "@/server/domains/orders/service";
import { prisma } from "@/server/db/client";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import {
  PrintDocFooter,
  PrintDocHeader,
  PrintDocMeta,
  PrintDocMuted,
  PrintDocSection,
  PrintDocTable,
  PrintDocument,
} from "@/components/print/PrintDocument";
import { formatDateUk } from "@/lib/utils";
import {
  decorationDisplayName,
  isMiscDecorationCostName,
} from "@/lib/decoration-format-pricing";
import { decorationCostQuantity } from "@/lib/decoration-qty";
import {
  fileAllocatedPieces,
  parseFileSizeQuantities,
} from "@/lib/artwork-file-qty";
import { isRealSizeCode } from "@/lib/order-item-sizes";
import { richTextIsEmpty, sanitizeRichHtml } from "@/lib/rich-text";

export default async function PrintBriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [order, company] = await Promise.all([
    getOrder(id),
    prisma.companySettings.findFirst(),
  ]);
  if (!order) notFound();

  const items = order.items.filter((row) => !row.superseded);
  const companyLines = [
    company?.legalName,
    company?.address,
    [company?.phone, company?.email].filter(Boolean).join(" · ") || null,
  ].filter((line): line is string => Boolean(line?.trim()));

  return (
    <>
      <PrintToolbar backHref={`/orders/${order.id}?tab=files`} title="Завдання на нанесення" />
      <PrintDocument runningTitle={`${company?.legalName ?? "ERP"} · нанесення ${order.number}`}>
        <PrintDocHeader
          companyName={company?.legalName ?? "Виробництво"}
          companyLines={companyLines}
          docType="Завдання на нанесення"
          docNumber={order.number}
          docMeta={[`від ${formatDateUk(order.createdAt)}`, `дедлайн ${formatDateUk(order.deadline)}`]}
        />
        <PrintDocMeta
          columns={[
            {
              label: "Замовлення",
              content: (
                <>
                  <p>
                    <strong>{order.number}</strong>
                  </p>
                  <PrintDocMuted>{order.client.companyName}</PrintDocMuted>
                </>
              ),
            },
            {
              label: "Для підрядника",
              content: (
                <>
                  <p>Без цін — лише вироби, тираж, розміри і макети.</p>
                  <PrintDocMuted>Менеджер: {order.manager.name}</PrintDocMuted>
                </>
              ),
            },
          ]}
        />

        {items.map((item) => {
          const decorations = item.decorations.filter(
            (row) => !isMiscDecorationCostName(row.nameSnapshot),
          );
          if (decorations.length === 0) return null;
          const realSizes = item.sizes.filter(
            (size) => isRealSizeCode(size.sizeCode) && size.quantity > 0,
          );
          return (
            <PrintDocSection
              key={item.id}
              title={`${item.nameUk} · ${item.totalQuantity} шт`}
              breakable
            >
              {realSizes.length > 0 ? (
                <p className="print-doc-item-sub" style={{ marginBottom: 8 }}>
                  Розміри:{" "}
                  {realSizes.map((size) => `${size.sizeNameUk} ${size.quantity} шт`).join(" · ")}
                </p>
              ) : null}
              <PrintDocTable
                head={
                  <tr>
                    <th>Нанесення</th>
                    <th className="num">Шт</th>
                    <th>Макет / розміри</th>
                    <th>Коментар</th>
                  </tr>
                }
                rows={
                  <>
                    {decorations.map((decoration) => {
                      const qty = decorationCostQuantity(
                        { quantity: decoration.quantity, name: decoration.nameSnapshot },
                        item.totalQuantity,
                      );
                      const files = order.files.filter(
                        (file) => file.orderItemDecorationId === decoration.id,
                      );
                      return (
                        <tr key={decoration.id}>
                          <td>
                            <strong>{decorationDisplayName(decoration.nameSnapshot)}</strong>
                          </td>
                          <td className="num">{qty} шт</td>
                          <td>
                            {files.length === 0 ? (
                              <span>—</span>
                            ) : (
                              files.map((file) => {
                                const sized = parseFileSizeQuantities(file.sizeQuantities);
                                const pieces = fileAllocatedPieces(file);
                                const sizeLabel =
                                  sized.length > 0
                                    ? sized
                                        .map((row) => {
                                          const name =
                                            realSizes.find((size) => size.sizeCode === row.sizeCode)
                                              ?.sizeNameUk ?? row.sizeCode;
                                          return `${name} ${row.quantity}`;
                                        })
                                        .join(", ")
                                    : pieces > 0
                                      ? `${pieces} шт`
                                      : "";
                                return (
                                  <p key={file.id}>
                                    {file.fileName}
                                    {sizeLabel ? ` · ${sizeLabel}` : ""}
                                  </p>
                                );
                              })
                            )}
                          </td>
                          <td>
                            {richTextIsEmpty(decoration.comment) ? (
                              "—"
                            ) : (
                              <div
                                className="print-doc-rich"
                                dangerouslySetInnerHTML={{
                                  __html: sanitizeRichHtml(decoration.comment),
                                }}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </>
                }
              />
            </PrintDocSection>
          );
        })}

        {!richTextIsEmpty(order.comment) ? (
          <PrintDocSection title="Коментар до замовлення">
            <div
              className="print-doc-rich"
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(order.comment) }}
            />
          </PrintDocSection>
        ) : null}

        <PrintDocFooter>
          Документ для підрядника з нанесення. Ціни в цьому завданні не вказуються.
        </PrintDocFooter>
      </PrintDocument>
    </>
  );
}
