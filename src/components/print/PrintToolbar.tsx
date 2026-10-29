"use client";

import Link from "next/link";
import { IconArrowLeft, IconPrint } from "@/components/ui/Icons";

export function PrintToolbar({
  backHref,
  title,
  backLabel = "До замовлення",
}: {
  backHref: string;
  title: string;
  backLabel?: string;
}) {
  return (
    <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 print:hidden">
      <Link
        href={backHref}
        className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-[13px] font-medium transition-colors hover:bg-[var(--color-surface-hover)]"
      >
        <IconArrowLeft size={15} />
        {backLabel}
      </Link>
      <span className="type-caption truncate">{title}</span>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--color-primary-600)] px-3.5 text-[13px] font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--color-primary-700)]"
      >
        <IconPrint size={15} />
        Друк / PDF
      </button>
    </div>
  );
}
