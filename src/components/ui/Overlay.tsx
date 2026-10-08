"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { IconClose } from "@/components/ui/Icons";
import { useSidebarOptional } from "@/components/layout/SidebarContext";

/** Overlays only open in response to user interaction, so they never render during SSR. */
function useOverlayBehaviour(open: boolean, onClose: () => void) {
  const sidebar = useSidebarOptional();
  const beginOverlay = sidebar?.beginOverlay;
  const endOverlay = sidebar?.endOverlay;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !beginOverlay || !endOverlay) return;
    beginOverlay();
    return () => endOverlay();
  }, [open, beginOverlay, endOverlay]);
}

function OverlayHeader({
  title,
  description,
  onClose,
}: {
  title: string;
  description?: string;
  onClose: () => void;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
      <div className="min-w-0">
        <h2 className="type-section-title">{title}</h2>
        {description ? <p className="type-body-secondary mt-0.5">{description}</p> : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрити"
        className="-mt-1 -mr-1 rounded-[var(--radius-control)] p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-primary)]"
      >
        <IconClose size={18} />
      </button>
    </header>
  );
}

/**
 * Right-side panel for inline creation without leaving the current process
 * (spec 10.3 — "швидке додавання без переходу в окремий розділ").
 */
export function SidePanel({
  open,
  onClose,
  title,
  description,
  footer,
  width = "md",
  /** Stack above another open SidePanel (e.g. line details inside composition). */
  elevated = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl" | "2xl";
  elevated?: boolean;
  children: React.ReactNode;
}) {
  useOverlayBehaviour(open, onClose);
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(
        // Full viewport so sidebar clicks hit the backdrop → onClose (unsaved guard).
        "fixed inset-0 flex justify-end",
        elevated ? "z-[60]" : "z-[56]",
      )}
    >
      <div
        className="anim-overlay absolute inset-0 bg-[rgba(15,23,32,0.4)] backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "anim-panel relative flex h-full w-full flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-panel)]",
          width === "sm" && "max-w-[440px]",
          width === "md" && "max-w-[480px]",
          width === "lg" && "max-w-[640px]",
          width === "xl" && "max-w-[880px]",
          width === "2xl" && "max-w-[1080px]",
        )}
      >
        <OverlayHeader title={title} description={description} onClose={onClose} />
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}

/** Centered modal for confirmations and spacious workflows (ref5). */
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  width = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
}) {
  useOverlayBehaviour(open, onClose);
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
      <div
        className="anim-overlay absolute inset-0 bg-[rgba(15,23,32,0.4)] backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "anim-modal relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-panel)]",
          width === "sm" && "max-w-[420px]",
          width === "md" && "max-w-[560px]",
          width === "lg" && "max-w-[760px]",
          width === "xl" && "max-w-[960px]",
        )}
      >
        <OverlayHeader title={title} description={description} onClose={onClose} />
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
