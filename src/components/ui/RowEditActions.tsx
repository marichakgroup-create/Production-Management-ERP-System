"use client";

import { IconCheck, IconTrash } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";

const btnBase =
  "inline-flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors disabled:opacity-40";

/**
 * Row action cell: while dirty → ✓ confirm + ✕ cancel; otherwise trash/remove.
 */
export function RowEditActions({
  dirty,
  pending,
  onConfirm,
  onCancel,
  onRemove,
  confirmLabel = "Зберегти рядок",
  cancelLabel = "Скасувати",
  removeLabel = "Видалити",
  className,
}: {
  dirty: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onRemove?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  removeLabel?: string;
  className?: string;
}) {
  if (dirty) {
    return (
      <div className={cn("inline-flex items-center gap-0.5", className)}>
        <button
          type="button"
          aria-label={confirmLabel}
          title={confirmLabel}
          disabled={pending}
          onClick={onConfirm}
          className={cn(
            btnBase,
            "text-[var(--color-primary-700)] hover:bg-[var(--color-primary-50)]",
          )}
        >
          <IconCheck size={15} />
        </button>
        <button
          type="button"
          aria-label={cancelLabel}
          title={cancelLabel}
          disabled={pending}
          onClick={onCancel}
          className={cn(
            btnBase,
            "text-[11px] text-[var(--color-text-quiet)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-danger-text)]",
          )}
        >
          ✕
        </button>
      </div>
    );
  }

  if (!onRemove) return null;

  return (
    <button
      type="button"
      aria-label={removeLabel}
      title={removeLabel}
      disabled={pending}
      onClick={onRemove}
      className={cn(
        btnBase,
        "text-[var(--color-text-tertiary)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)]",
        className,
      )}
    >
      <IconTrash size={15} />
    </button>
  );
}

/** Soft highlight for a table row with unconfirmed edits. */
export const ROW_DIRTY_CLASS =
  "bg-[color-mix(in_srgb,var(--color-primary-50)_70%,transparent)] ring-1 ring-inset ring-[var(--color-primary-200)]";
