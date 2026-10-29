import Link from "next/link";
import { StatusBadge } from "@/components/ui/Page";
import { TableCard, TableToolbar } from "@/components/ui/Table";
import { IconDecoration, IconPrint, IconQuote, IconSpec } from "@/components/ui/Icons";
import { GeneratingDocumentLink } from "@/components/print/GeneratingDocumentLink";
import { formatDateUk } from "@/lib/utils";
import {
  OrderAttachments,
  type OrderArtworkItem,
  type OrderFileRow,
} from "@/components/orders/OrderAttachments";

function DocumentRow({
  icon,
  title,
  description,
  status,
  tone,
  href,
  disabled,
  generating,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: string;
  tone: "neutral" | "success" | "warning";
  href: string;
  disabled?: boolean;
  generating?: boolean;
}) {
  return (
    <div className="flex gap-3 border-b border-[var(--color-divider)] px-4 py-3 last:border-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">{title}</p>
          <StatusBadge tone={tone}>{status}</StatusBadge>
        </div>
        <p className="type-body-secondary mt-0.5">{description}</p>
        {disabled ? (
          <p className="type-caption mt-2">Недоступно</p>
        ) : generating ? (
          <GeneratingDocumentLink
            href={href}
            className="mt-2 inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-3 text-[13px] font-medium transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            <IconPrint size={14} />
            Відкрити
          </GeneratingDocumentLink>
        ) : (
          <Link
            href={href}
            target="_blank"
            className="mt-2 inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-3 text-[13px] font-medium transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            <IconPrint size={14} />
            Відкрити
          </Link>
        )}
      </div>
    </div>
  );
}

export function OrderDocumentsCard({
  orderId,
  itemId,
  hasApprovedVersion,
  quotationReady = false,
  quotationFrozen = false,
  specificationLockedAt,
  needsArtwork = false,
}: {
  orderId: string;
  itemId?: string;
  hasApprovedVersion: boolean;
  quotationReady?: boolean;
  quotationFrozen?: boolean;
  specificationLockedAt: string | null;
  needsArtwork?: boolean;
}) {
  const itemQuery = itemId ? `?item=${itemId}` : "";
  const kpReady = quotationReady || hasApprovedVersion || quotationFrozen;

  return (
    <TableCard>
      <TableToolbar left={<span className="type-subsection">Документи замовлення</span>} />
      <DocumentRow
        icon={<IconQuote size={18} />}
        title="Комерційна пропозиція"
        description={
          quotationFrozen
            ? "Зафіксовано при передачі у виробництво"
            : kpReady
              ? "За поточним складом і цінами замовлення"
              : "З’явиться після вказання тиражу"
        }
        status={quotationFrozen ? "Зафіксовано" : kpReady ? "Актуально" : "Очікує"}
        tone={quotationFrozen ? "success" : kpReady ? "success" : "warning"}
        href={`/orders/${orderId}/quotation`}
        disabled={!kpReady}
        generating
      />
      <DocumentRow
        icon={<IconDecoration size={18} />}
        title="Завдання на нанесення"
        description="Для підрядника: вироби, шт, розміри, макети і коментарі"
        status={needsArtwork ? "За макетами" : "Готово"}
        tone={needsArtwork ? "warning" : "success"}
        href={`/orders/${orderId}/print-brief`}
      />
      <DocumentRow
        icon={<IconSpec size={18} />}
        title="Специфікація"
        description={
          specificationLockedAt
            ? `Зафіксована ${formatDateUk(specificationLockedAt)}`
            : "Після «Передати у виробництво»"
        }
        status={specificationLockedAt ? "Зафіксовано" : "Очікує"}
        tone={specificationLockedAt ? "success" : "neutral"}
        href={`/orders/${orderId}/specification${itemQuery}`}
        disabled={!specificationLockedAt}
      />
    </TableCard>
  );
}

export function FilesTab({
  orderId,
  itemId,
  hasApprovedVersion,
  quotationReady = false,
  quotationFrozen = false,
  specificationLockedAt,
  artworkItems,
  files,
  locked,
  needsArtwork = false,
  showPrintDocs = true,
}: {
  orderId: string;
  itemId?: string;
  hasApprovedVersion: boolean;
  /** Live КП from current order (qty > 0). */
  quotationReady?: boolean;
  /** After handover — prices locked from approved proposal. */
  quotationFrozen?: boolean;
  specificationLockedAt: string | null;
  needsArtwork?: boolean;
  artworkItems: OrderArtworkItem[];
  files: OrderFileRow[];
  locked?: boolean;
  /** When false, print docs are rendered beside attachments (order rail). */
  showPrintDocs?: boolean;
}) {
  return (
    <div className="space-y-4">
      <OrderAttachments
        orderId={orderId}
        files={files}
        artworkItems={artworkItems}
        locked={locked}
      />
      {showPrintDocs ? (
        <OrderDocumentsCard
          orderId={orderId}
          itemId={itemId}
          hasApprovedVersion={hasApprovedVersion}
          quotationReady={quotationReady}
          quotationFrozen={quotationFrozen}
          specificationLockedAt={specificationLockedAt}
          needsArtwork={needsArtwork}
        />
      ) : null}
    </div>
  );
}
