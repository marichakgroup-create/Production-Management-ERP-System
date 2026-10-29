import Link from "next/link";
import { cn } from "@/lib/utils";

export type TabItem = {
  key: string;
  label: string;
  href: string;
  icon?: React.ReactNode;
  count?: number;
  disabled?: boolean;
  /** Yellow attention marker — action needed on this tab. */
  attention?: boolean;
};

/** Segmented pill tabs (ref3): used for switching context inside one object. */
export function SegmentedTabs({
  items,
  active,
  className,
  onNavigate,
}: {
  items: TabItem[];
  active: string;
  className?: string;
  /** Return false to block navigation (e.g. unsaved changes). */
  onNavigate?: (href: string) => boolean | void;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-1",
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.key === active;
        const content = (
          <>
            {item.icon}
            <span>{item.label}</span>
            {typeof item.count === "number" ? (
              <span
                className={cn(
                  "tabular rounded-full px-1.5 text-[11px] font-semibold",
                  isActive
                    ? "on-primary bg-white/20"
                    : "bg-[var(--color-surface)] text-[var(--color-text-tertiary)]",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </>
        );

        const classes = cn(
          "inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition-colors",
          isActive
            ? "on-primary bg-[var(--color-primary-500)] shadow-[0_1px_2px_rgba(18,31,24,0.12)]"
            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]",
          item.disabled && "cursor-not-allowed opacity-45",
        );

        if (item.disabled) {
          return (
            <span key={item.key} className={classes} aria-disabled>
              {content}
            </span>
          );
        }

        return (
          <Link
            key={item.key}
            href={item.href}
            className={classes}
            aria-current={isActive ? "page" : undefined}
            onClick={
              onNavigate
                ? (event) => {
                    if (onNavigate(item.href) === false) {
                      event.preventDefault();
                    }
                  }
                : undefined
            }
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
}

/** Underlined sub-navigation for list views (ref1). */
export function ViewTabs({
  items,
  active,
  className,
  onNavigate,
}: {
  items: TabItem[];
  active: string;
  className?: string;
  /** Return false to block navigation (e.g. unsaved changes). */
  onNavigate?: (href: string) => boolean | void;
}) {
  return (
    <nav className={cn("flex flex-wrap items-center gap-4 border-b border-[var(--color-border)]", className)}>
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            onClick={
              onNavigate
                ? (event) => {
                    if (onNavigate(item.href) === false) {
                      event.preventDefault();
                    }
                  }
                : undefined
            }
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-0.5 pb-2 text-[13.5px] font-semibold transition-colors",
              isActive
                ? "border-[var(--color-primary-600)] text-[var(--color-text-primary)]"
                : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
            )}
          >
            {item.label}
            {item.attention ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-[var(--color-warning-text)] ring-[3px] ring-[var(--color-warning-text)]/20"
                aria-label="Потрібна дія"
                title="Потрібна дія"
                role="status"
              />
            ) : null}
            {typeof item.count === "number" ? (
              <span className="tabular text-[11.5px] font-semibold text-[var(--color-text-tertiary)]">
                {item.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Client-side panel tabs (edit drawers) — underlined active, compact. */
export function PanelTabs({
  items,
  active,
  onChange,
  className,
}: {
  items: Array<{
    key: string;
    label: string;
    icon?: React.ReactNode;
  }>;
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 border-b border-[var(--color-border)]",
        className,
      )}
      role="tablist"
    >
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.key)}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-0.5 pb-2 text-[13.5px] font-semibold transition-colors",
              isActive
                ? "border-[var(--color-primary-600)] text-[var(--color-text-primary)]"
                : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
            )}
          >
            {item.icon ? (
              <span
                className={cn(
                  isActive
                    ? "text-[var(--color-primary-600)]"
                    : "text-[var(--color-text-tertiary)]",
                )}
              >
                {item.icon}
              </span>
            ) : null}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
