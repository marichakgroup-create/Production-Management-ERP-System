import Link from "next/link";
import { cn } from "@/lib/utils";
import { IconChevronRight } from "@/components/ui/Icons";

/**
 * Scan card for the contacts list (progressive disclosure).
 * Essentials only — open the object to edit people, legal details, notes.
 */
export function ContactSummaryCard({
  href,
  title,
  primaryLine,
  secondaryLine,
  meta,
  className,
}: {
  href: string;
  title: string;
  /** Primary person / role. */
  primaryLine?: string | null;
  /** Phone · email. */
  secondaryLine?: string | null;
  /** Quiet chips: "3 зам.", "2 особи". */
  meta?: string[];
  className?: string;
}) {
  const chips = (meta ?? []).filter(Boolean);

  return (
    <Link
      href={href}
      className={cn(
        "group flex h-full min-w-0 flex-col rounded-[var(--radius-surface)] border border-[var(--color-border)]",
        "bg-[var(--color-surface)] p-3.5 shadow-[var(--shadow-card)] transition-colors",
        "hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="type-subsection truncate text-[var(--color-text-primary)] group-hover:text-[var(--color-primary-800)]">
            {title}
          </h3>
          {primaryLine?.trim() ? (
            <p className="type-body-secondary mt-0.5 truncate">{primaryLine.trim()}</p>
          ) : (
            <p className="type-caption mt-0.5 text-[var(--color-text-quiet)]">Контакт не вказано</p>
          )}
          {secondaryLine?.trim() ? (
            <p className="type-caption mt-1 truncate tabular text-[var(--color-text-tertiary)]">
              {secondaryLine.trim()}
            </p>
          ) : null}
        </div>
        <span
          className={cn(
            "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)]",
            "text-[var(--color-text-quiet)] transition-colors",
            "group-hover:bg-[var(--color-surface-subtle)] group-hover:text-[var(--color-primary-700)]",
          )}
          aria-hidden
        >
          <IconChevronRight size={16} />
        </span>
      </div>

      {chips.length > 0 ? (
        <div className="mt-auto flex flex-wrap gap-x-2 gap-y-1 border-t border-[var(--color-divider)] pt-2.5 mt-3">
          {chips.map((chip) => (
            <span key={chip} className="type-caption tabular text-[var(--color-text-quiet)]">
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}

export function ContactCardsGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}
