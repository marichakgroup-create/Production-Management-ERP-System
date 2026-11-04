"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Modal } from "@/components/ui/Overlay";
import { useAppDialog } from "@/components/ui/ConfirmDialog";
import { StatusBadge } from "@/components/ui/Page";
import {
  Table,
  TableCard,
  TableEmpty,
  TableToolbar,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/Table";
import { IconCheck, IconChevronDown, IconChevronRight, IconLock, IconTrash } from "@/components/ui/Icons";
import { cn, formatDateUk, formatMoneyUah } from "@/lib/utils";
import type { OrderProposalGroup } from "@/lib/order-proposals";
import {
  activateProposalAction,
  approveProposalAction,
  deleteProposalAction,
} from "@/server/domains/orders/actions";
import { HandoverDialog, type ReadinessCheck } from "./HandoverDialog";
import { SaveProposalPanel, type ProposalDraftLine } from "./SaveProposalPanel";

export function VersionsTab({
  orderId,
  orderNumber,
  itemCount,
  activeItemName,
  proposals,
  draftLines,
  minimumMarginPercent,
  orderTotalQuantity,
  orderTotalValue,
  status,
  activeProposalRevision = null,
  restorableRevisions = [],
  canApprove,
  canSwitchProposal = false,
  sizesReady = true,
  sizesPendingCount = 0,
  configurationHref,
  specificationLockedAt,
  readiness,
  autoSave = false,
  draftDrift = false,
  deadline = null,
  paymentMethod = null,
}: {
  orderId: string;
  orderNumber: string;
  itemCount: number;
  activeItemName: string;
  proposals: OrderProposalGroup[];
  draftLines: ProposalDraftLine[];
  minimumMarginPercent: number;
  orderTotalQuantity: number;
  orderTotalValue: number;
  status: string;
  activeProposalRevision?: number | null;
  restorableRevisions?: number[];
  canApprove: boolean;
  canSwitchProposal?: boolean;
  sizesReady?: boolean;
  sizesPendingCount?: number;
  /** Where to send the admin when size layout is required before production. */
  configurationHref?: string;
  specificationLockedAt: string | null;
  readiness: ReadinessCheck[];
  autoSave?: boolean;
  draftDrift?: boolean;
  deadline?: Date | string | null;
  paymentMethod?: string | null;
}) {
  const router = useRouter();
  const dialog = useAppDialog();
  const [pending, startTransition] = useTransition();
  const [approveTarget, setApproveTarget] = useState<OrderProposalGroup | null>(null);
  const [expanded, setExpanded] = useState<string | null>(proposals[0]?.key ?? null);
  const [error, setError] = useState<string | null>(null);

  const approved = proposals.find((row) => row.isComplete && row.isApproved);
  const latestComplete = proposals.find((row) => row.isComplete) ?? null;
  const handedOver = status === "HANDED_TO_PRODUCTION" || status === "CLOSED";
  const isApprovedStatus = status === "APPROVED";
  const handoverReady = readiness.every((check) => check.done);
  const needsApproval = Boolean(latestComplete) && !approved && canApprove && !handedOver;
  const needsSizeBeforeHandover =
    Boolean(approved) && !handedOver && !sizesReady;
  const sizesHref = configurationHref ?? `/orders/${orderId}?tab=configuration`;
  const restorable = new Set(restorableRevisions);

  function approve(proposal: OrderProposalGroup) {
    if (proposal.revision == null) return;
    setError(null);
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("proposalRevision", String(proposal.revision));
    startTransition(async () => {
      const result = await approveProposalAction(formData);
      if (!result.ok) {
        setError(
          result.error === "INCOMPLETE_PROPOSAL"
            ? "Пропозиція не покриває всі поточні позиції. Збережіть нову пропозицію після змін складу."
            : "Не вдалося погодити пропозицію.",
        );
        return;
      }
      setApproveTarget(null);
      router.refresh();
    });
  }

  async function activate(proposal: OrderProposalGroup) {
    if (proposal.revision == null) return;
    const ok = await dialog.ask({
      title: `Зробити активною v${proposal.revision}?`,
      message:
        "Склад замовлення підставиться з цієї пропозиції, статус стане «Погодження».",
      confirmLabel: "Зробити активною",
    });
    if (!ok) return;
    setError(null);
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("proposalRevision", String(proposal.revision));
    startTransition(async () => {
      const result = await activateProposalAction(formData);
      if (!result.ok) {
        setError(
          result.error === "SNAPSHOT_INCOMPLETE"
            ? "Цю пропозицію не можна відновити — збережіть нову."
            : "Не вдалося перемкнути пропозицію.",
        );
        return;
      }
      router.refresh();
    });
  }

  async function removeProposal(proposal: OrderProposalGroup) {
    if (proposal.revision == null) return;
    const ok = await dialog.ask({
      title: `Видалити пропозицію v${proposal.revision}?`,
      message: "Активна пропозиція залишиться.",
      confirmLabel: "Видалити",
      danger: true,
    });
    if (!ok) return;
    setError(null);
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("proposalRevision", String(proposal.revision));
    startTransition(async () => {
      const result = await deleteProposalAction(formData);
      if (!result.ok) {
        setError(
          result.error === "ACTIVE_PROPOSAL"
            ? "Активну пропозицію не можна видалити. Спочатку зробіть активною іншу."
            : result.error === "LAST_PROPOSAL"
              ? "Має залишитись хоча б одна пропозиція."
              : result.error === "ORDER_LOCKED"
                ? "До цього замовлення пропозиції вже не змінюються."
                : "Не вдалося видалити пропозицію.",
        );
        return;
      }
      router.refresh();
    });
  }

  const savedProposalCount = proposals.filter((row) => row.revision != null).length;

  return (
    <div className="space-y-4">
      {dialog.view}
      {error ? <Banner tone="danger">{error}</Banner> : null}

      {itemCount > 1 ? (
        <Banner tone="info" title={`Замовлення: ${itemCount} позиції`}>
          Пропозиція фіксує ціни всіх виробів разом. Зараз переглядаєте позицію «{activeItemName}» — збереження
          стосується всього замовлення.
        </Banner>
      ) : null}

      {draftDrift && !handedOver && !isApprovedStatus ? (
        <Banner tone="warning" title="Поточний розрахунок відрізняється від останньої пропозиції">
          Чернетка змінилась після збереження. КП уже показує поточні ціни; збережіть нову пропозицію
          для погодження.
        </Banner>
      ) : null}

      <TableCard>
        <TableToolbar
          left={
            <div className="min-w-0">
              <span className="type-subsection">Пропозиції для клієнта</span>
              {activeProposalRevision != null ? (
                <p className="type-caption mt-0.5">
                  Активна: v{activeProposalRevision}
                </p>
              ) : null}
            </div>
          }
          right={
            handedOver ? (
              <span className="type-caption inline-flex items-center gap-1">
                <IconLock size={14} /> Специфікацію зафіксовано
              </span>
            ) : (
              <SaveProposalPanel
                orderId={orderId}
                lines={draftLines}
                minimumMarginPercent={minimumMarginPercent}
                accent={!needsApproval && !approved}
                defaultOpen={autoSave}
                activeRevision={activeProposalRevision}
              />
            )
          }
        />
        <Table>
          <THead>
            <TH>Пропозиція</TH>
            <TH align="right">Позицій</TH>
            <TH align="right">К-сть</TH>
            <TH align="right">Разом до сплати</TH>
            <TH>Стан</TH>
            <TH width="168px" stickyRight />
          </THead>
          <TBody>
            {proposals.length === 0 ? (
              <TableEmpty
                colSpan={6}
                title="Збережених пропозицій ще немає"
                description="Пропозиція фіксує ціни для погодження. КП до виробництва завжди з поточного складу."
              />
            ) : (
              proposals.map((proposal) => {
                const open = expanded === proposal.key;
                const title =
                  proposal.revision != null
                    ? `Пропозиція v${proposal.revision}`
                    : `Позиція v${proposal.lines[0]?.versionNumber ?? "?"}`;
                const isActive =
                  proposal.revision != null &&
                  proposal.revision === activeProposalRevision;
                const canActivate =
                  canSwitchProposal &&
                  !handedOver &&
                  proposal.revision != null &&
                  !isActive &&
                  restorable.has(proposal.revision);
                const canDelete =
                  canSwitchProposal &&
                  !handedOver &&
                  proposal.revision != null &&
                  !isActive &&
                  savedProposalCount > 1;
                return (
                  <Fragment key={proposal.key}>
                    <TR className={isActive ? "bg-[var(--color-tint-sage)]/35" : undefined}>
                      <TD>
                        <button
                          type="button"
                          className="flex items-start gap-2 text-left"
                          onClick={() => setExpanded(open ? null : proposal.key)}
                        >
                          {open ? (
                            <IconChevronDown size={16} className="mt-0.5 shrink-0" />
                          ) : (
                            <IconChevronRight size={16} className="mt-0.5 shrink-0" />
                          )}
                          <span>
                            <span className="font-medium">{title}</span>
                            {proposal.label ? (
                              <span className="ml-1 font-normal text-[var(--color-text-secondary)]">
                                {proposal.label}
                              </span>
                            ) : null}
                            <span className="type-caption mt-0.5 block">
                              {formatDateUk(proposal.createdAt)} · {proposal.authorName}
                            </span>
                          </span>
                        </button>
                      </TD>
                      <TD numeric>{proposal.lines.length}</TD>
                      <TD numeric className="tabular">
                        {proposal.totalQuantity} шт
                      </TD>
                      <TD numeric className="font-medium tabular">
                        <p>{formatMoneyUah(proposal.totalSellingValue)}</p>
                        <p className="type-caption mt-0.5 font-normal text-[var(--color-text-secondary)]">
                          Виріб {formatMoneyUah(proposal.totalProductValue)}
                          <span className="mx-1 text-[var(--color-divider)]">·</span>
                          Нанесення {formatMoneyUah(proposal.totalDecorationValue)}
                        </p>
                      </TD>
                      <TD nowrap>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isActive ? (
                            <StatusBadge dot tone="info">
                              Активна
                            </StatusBadge>
                          ) : null}
                          {!proposal.isComplete ? (
                            <StatusBadge dot tone="warning">
                              Неповна
                            </StatusBadge>
                          ) : proposal.isApproved ? (
                            <StatusBadge dot tone="success">
                              Погоджено
                            </StatusBadge>
                          ) : (
                            <StatusBadge dot>Чернетка</StatusBadge>
                          )}
                        </div>
                      </TD>
                      <TD align="right" stickyRight>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {canActivate ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={pending}
                              onClick={() => activate(proposal)}
                              hint="activateProposal"
                            >
                              Зробити активною
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => removeProposal(proposal)}
                              hint="deleteProposal"
                            >
                              <IconTrash size={14} />
                              Видалити
                            </Button>
                          ) : null}
                          {proposal.isComplete &&
                          !proposal.isApproved &&
                          canApprove &&
                          !handedOver &&
                          (isActive || activeProposalRevision == null) ? (
                            <Button
                              size="sm"
                              variant={
                                needsApproval && proposal.key === latestComplete?.key
                                  ? "primary"
                                  : "secondary"
                              }
                              onClick={() => setApproveTarget(proposal)}
                              hint="approveProposal"
                            >
                              <IconCheck size={14} />
                              Погодити
                            </Button>
                          ) : null}
                        </div>
                      </TD>
                    </TR>
                    {open
                      ? proposal.lines.map((line) => (
                          <TR key={`${proposal.key}-${line.id}`} className="bg-[var(--color-surface-subtle)]/50">
                            <TD colSpan={2} className="pl-10 text-[var(--color-text-secondary)]">
                              <p className="font-medium text-[var(--color-text-primary)]">
                                {line.itemNameUk}
                              </p>
                              {line.sizeRun ? (
                                <p className="type-caption mt-0.5 tabular text-[var(--color-text-secondary)]">
                                  {line.sizeRun}
                                </p>
                              ) : null}
                            </TD>
                            <TD numeric className="tabular">
                              {line.totalQuantity} шт
                            </TD>
                            <TD numeric className="tabular">
                              <p>
                                {formatMoneyUah(line.sellingPricePerUnit)} / од. →{" "}
                                {formatMoneyUah(line.totalSellingValue)}
                              </p>
                              <p className="type-caption mt-0.5 text-[var(--color-text-secondary)]">
                                Виріб {formatMoneyUah(line.productPerUnit)} / од. →{" "}
                                {formatMoneyUah(line.productTotal)}
                              </p>
                              <p className="type-caption text-[var(--color-text-secondary)]">
                                Нанесення {formatMoneyUah(line.decorationPerUnit)} / од. →{" "}
                                {formatMoneyUah(line.decorationTotal)}
                              </p>
                            </TD>
                            <TD numeric className="tabular">
                              {line.marginPercent.toFixed(1)}%
                            </TD>
                            <TD />
                          </TR>
                        ))
                      : null}
                  </Fragment>
                );
              })
            )}
          </TBody>
        </Table>
      </TableCard>

      {(approved && isApprovedStatus) || handedOver ? (
        <div
          className={cn(
            "rounded-[var(--radius-surface)] border p-4",
            handoverReady
              ? "border-[var(--color-primary-200)] bg-[var(--color-tint-sage)]/40"
              : "border-[var(--color-border)] bg-[var(--color-surface)]",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="type-subsection">Передача у виробництво</h3>
              <p className="type-body-secondary mt-0.5 max-w-xl">
                {handedOver
                  ? `Специфікацію зафіксовано ${specificationLockedAt ? formatDateUk(specificationLockedAt) : ""}. Виробництво працює за погодженою пропозицією.`
                  : handoverReady
                    ? `Погоджено пропозицію v${approved!.revision} на ${formatMoneyUah(approved!.totalSellingValue)}. Натисніть «Передати у виробництво».`
                    : `Пропозицію v${approved!.revision} погоджено. Закрийте умови передачі — якщо є нанесення, додайте макет у «Документах».`}
              </p>
              {needsSizeBeforeHandover ? (
                <Banner tone="warning" title="Потрібна розкладка розмірів" className="mt-3">
                  Перед передачею у виробництво розкладіть тираж по реальних розмірах у
                  Комплектації. На етапі розрахунку КП рахується для базових XS–XXL.
                  {sizesPendingCount > 0 ? ` Залишилось позицій: ${sizesPendingCount}.` : ""}{" "}
                  <a
                    href={sizesHref}
                    className="font-semibold underline underline-offset-2"
                  >
                    Відкрити Комплектацію
                  </a>
                </Banner>
              ) : null}
            </div>
            {handedOver ? (
              <StatusBadge tone="info">
                <IconLock size={13} />
                <span className="ml-1">Зафіксовано</span>
              </StatusBadge>
            ) : (
              <HandoverDialog
                orderId={orderId}
                orderNumber={orderNumber}
                productName={
                  itemCount > 1 ? `${itemCount} позиції замовлення` : activeItemName
                }
                totalQuantity={orderTotalQuantity}
                totalValue={approved?.totalSellingValue ?? orderTotalValue}
                checks={readiness}
                deadline={deadline}
                paymentMethod={paymentMethod}
                disabled={!canApprove}
              />
            )}
          </div>
        </div>
      ) : null}

      <Modal
        open={Boolean(approveTarget)}
        onClose={() => setApproveTarget(null)}
        title={`Погодити пропозицію v${approveTarget?.revision ?? ""}?`}
        description="Погоджена пропозиція — основа для передачі у виробництво; КП до цього з поточного складу"
        width="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setApproveTarget(null)} disabled={pending}>
              Скасувати
            </Button>
            <Button
              onClick={() => approveTarget && approve(approveTarget)}
              disabled={pending || approveTarget?.revision == null}
            >
              {pending ? "Погодження…" : "Погодити пропозицію"}
            </Button>
          </>
        }
      >
        {approveTarget ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border)]">
              <table className="erp-table w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--color-table-section-border)]">
                    <th className="px-3 py-2 text-left">Виріб</th>
                    <th className="px-3 py-2 text-right">К-сть</th>
                    <th className="px-3 py-2 text-right">Виріб</th>
                    <th className="px-3 py-2 text-right">Нанесення</th>
                    <th className="px-3 py-2 text-right">Разом</th>
                  </tr>
                </thead>
                <tbody>
                  {approveTarget.lines.map((line) => (
                    <tr key={line.id} className="border-b border-[var(--color-divider)] last:border-0">
                      <td className="px-3 py-2">{line.itemNameUk}</td>
                      <td className="px-3 py-2 text-right tabular">{line.totalQuantity}</td>
                      <td className="px-3 py-2 text-right tabular">
                        {formatMoneyUah(line.productTotal)}
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {formatMoneyUah(line.decorationTotal)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular">
                        {formatMoneyUah(line.totalSellingValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="type-body-secondary text-right">
              Виріб {formatMoneyUah(approveTarget.totalProductValue)}
              <span className="mx-2 text-[var(--color-divider)]">·</span>
              Нанесення {formatMoneyUah(approveTarget.totalDecorationValue)}
              <span className="mx-2 text-[var(--color-divider)]">·</span>
              Разом:{" "}
              <span className="font-semibold text-[var(--color-text-primary)] tabular">
                {formatMoneyUah(approveTarget.totalSellingValue)}
              </span>
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
