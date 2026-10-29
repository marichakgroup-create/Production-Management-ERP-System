"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSidebarOptional } from "@/components/layout/SidebarContext";
import { Hint } from "@/components/ui/Hint";
import type { UiHint, UiHintKey } from "@/lib/ui-hints";

export function DocumentGeneratingOverlay({
  label = "Генеруємо комерційну пропозицію…",
  usePortal = true,
}: {
  label?: string;
  usePortal?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const node = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center print:hidden"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="absolute inset-0 bg-[rgba(15,23,32,0.45)] backdrop-blur-[2px]" />
      <div className="relative flex flex-col items-center gap-3 rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-5 shadow-[var(--shadow-panel)]">
        <span
          aria-hidden
          className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary-600)] border-t-transparent"
        />
        <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">{label}</p>
      </div>
    </div>
  );

  if (usePortal && mounted) return createPortal(node, document.body);
  return node;
}

export function GeneratingDocumentLink({
  href,
  className,
  children,
  label = "Генеруємо комерційну пропозицію…",
  hint,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
  label?: string;
  hint?: UiHintKey | UiHint;
}) {
  const [busy, setBusy] = useState(false);
  const sidebar = useSidebarOptional();
  const beginOverlay = sidebar?.beginOverlay;
  const endOverlay = sidebar?.endOverlay;

  useEffect(() => {
    if (!busy || !beginOverlay || !endOverlay) return;
    beginOverlay();
    return () => endOverlay();
  }, [busy, beginOverlay, endOverlay]);

  const link = (
    <Link
      href={href}
      className={className}
      aria-busy={busy || undefined}
      onClick={() => setBusy(true)}
    >
      {children}
    </Link>
  );

  return (
    <>
      {hint ? (
        <Hint hint={hint} showTitle={false}>
          {link}
        </Hint>
      ) : (
        link
      )}
      {busy ? <DocumentGeneratingOverlay label={label} /> : null}
    </>
  );
}
