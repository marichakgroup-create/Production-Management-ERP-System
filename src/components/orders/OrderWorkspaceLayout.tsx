import Link from "next/link";
import { cn } from "@/lib/utils";
import { IconEdit } from "@/components/ui/Icons";
import { orderPipeline, orderStatusHintFor, orderStatusLabel } from "@/lib/order-status";

const pipelineShortLabel: Record<string, string> = {
  DRAFT: "Чернетка",
  CALCULATION: "Розрахунок",
  PENDING_APPROVAL: "Погодження",
  APPROVED: "Погоджено",
  HANDED_TO_PRODUCTION: "У виробництві",
};

export type OrderFact = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
};

/** CRM-style object header: order on the left, optional client column on the right. */
export function OrderWorkspaceHeader({
  title,
  badge,
  subtitle,
  summary,
  meta,
  aside,
  actions,
  className,
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  subtitle?: React.ReactNode;
  summary?: React.ReactNode;
  meta?: React.ReactNode;
  /** Right column — typically client contacts. */
  aside?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:flex-nowrap">
        <div className="shrink-0">
          <div className="flex items-center gap-2.5 whitespace-nowrap">
            <h1 className="type-page-title">{title}</h1>
            {badge}
          </div>
          {subtitle ? <p className="type-body-secondary mt-1 whitespace-nowrap">{subtitle}</p> : null}
        </div>
        {summary ? <div className="min-w-0 flex-1">{summary}</div> : null}
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 [&_a]:!px-2 [&_button]:!px-2">{actions}</div>
        ) : null}
      </div>

      <div
        className={cn(
          "grid gap-4",
          aside && "lg:grid-cols-[minmax(0,1.2fr)_minmax(220px,0.8fr)] lg:gap-6",
        )}
      >
        <div className="min-w-0">{meta}</div>
        {aside ? (
          <aside className="min-w-0 rounded-[10px] border border-[var(--color-divider)] bg-[var(--color-bg)]/50 px-3.5 py-3 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:border-l lg:border-[var(--color-divider)] lg:pl-6">
            {aside}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/** Compact labeled rows for order / client header columns. */
export function OrderHeaderFacts({
  title,
  facts,
  columns = 3,
  compact = false,
  layout = "row",
  className,
}: {
  title?: string;
  facts: Array<{ label: string; value: React.ReactNode; hint?: string; icon?: React.ReactNode }>;
  columns?: 1 | 2 | 3 | 4 | 5 | 6;
  compact?: boolean;
  /** Two-by-two block without the horizontal row dividers. */
  layout?: "row" | "grid";
  className?: string;
}) {
  if (facts.length === 0) return null;
  return (
    <div className={cn("min-w-0", className)}>
      {title ? (
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-quiet)]">
          {title}
        </p>
      ) : null}
      <dl
        className={cn(
          "grid gap-x-3 gap-y-2",
          layout === "grid" && "grid-cols-2 gap-x-6 gap-y-3",
          layout === "row" &&
            compact &&
            "grid-cols-2 sm:grid-cols-[minmax(90px,1.25fr)_minmax(76px,1fr)_minmax(56px,.7fr)_minmax(42px,.55fr)]",
          layout === "row" && !compact && columns === 1 && "grid-cols-1",
          layout === "row" && !compact && columns === 2 && "grid-cols-2",
          layout === "row" && !compact && columns === 3 && "grid-cols-3",
          layout === "row" && !compact && columns === 4 && "grid-cols-4",
          layout === "row" && !compact && columns === 5 && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
          layout === "row" && !compact && columns === 6 && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
        )}
      >
        {facts.map((fact, index) => (
          <div
            key={fact.label}
            className={cn(
              "flex min-w-0 gap-2.5 py-1",
              compact && layout === "row" && "gap-0 py-0",
              layout === "row" && index > 0 && "lg:border-l lg:border-[var(--color-divider)] lg:pl-5",
              compact && layout === "row" && index > 0 && "border-l border-[var(--color-divider)] pl-3 lg:pl-3",
            )}
          >
            {fact.icon && !compact ? (
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center text-[var(--color-text-secondary)]">
                {fact.icon}
              </span>
            ) : null}
            <div className="min-w-0">
              <dt className={compact ? "text-[11px] leading-4 text-[var(--color-text-secondary)]" : "type-label"}>
                {fact.label}
              </dt>
              <dd className={cn(
                "mt-0.5 font-semibold leading-snug text-[var(--color-text-primary)]",
                compact ? "whitespace-nowrap text-[12px]" : "truncate text-[13px]",
              )}>
                {fact.value}
              </dd>
              {fact.hint ? (
                <dd className={compact ? "mt-0.5 truncate text-[10.5px] leading-4 text-[var(--color-text-secondary)]" : "type-body-secondary mt-0.5 truncate"}>
                  {fact.hint}
                </dd>
              ) : null}
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Horizontal key facts strip (email / phone pattern from CRM header). */
export function OrderFactsStrip({ facts, className }: { facts: OrderFact[]; className?: string }) {
  if (facts.length === 0) return null;

  return (
    <dl
      className={cn(
        "grid grid-cols-2 border-t border-[var(--color-divider)] sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      {facts.map((fact, index) => (
        <div
          key={fact.label}
          className={cn(
            "min-w-0 px-4 py-3",
            index < facts.length - 1 && "lg:border-r lg:border-[var(--color-divider)]",
            index % 2 === 0 && index < facts.length - 1 && "border-r border-[var(--color-divider)] sm:border-r-0",
            index < facts.length - (facts.length % 2 === 0 ? 2 : 1) &&
              "border-b border-[var(--color-divider)] sm:border-b-0",
          )}
        >
          <dt className="type-caption">{fact.label}</dt>
          <dd className="mt-0.5 truncate text-[13.5px] font-semibold text-[var(--color-text-primary)]">
            {fact.value}
          </dd>
          {fact.hint ? <dd className="type-caption mt-0.5 truncate">{fact.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

const CHEVRON = 8;

function pipelineClip(isFirst: boolean, isLast: boolean) {
  if (isFirst && isLast) return "polygon(0 0, 100% 0, 100% 100%, 0 100%)";
  if (isFirst) {
    return `polygon(0 0, calc(100% - ${CHEVRON}px) 0, 100% 50%, calc(100% - ${CHEVRON}px) 100%, 0 100%)`;
  }
  if (isLast) {
    return `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${CHEVRON}px 50%)`;
  }
  return `polygon(0 0, calc(100% - ${CHEVRON}px) 0, 100% 50%, calc(100% - ${CHEVRON}px) 100%, 0 100%, ${CHEVRON}px 50%)`;
}

/** CRM chevron pipeline for order lifecycle. */
export function OrderChevronPipeline({
  status,
  nextTitle,
  className,
  variant = "chevron",
}: {
  status: string;
  nextTitle?: string;
  className?: string;
  variant?: "chevron" | "steps";
}) {
  const cancelled = status === "CANCELLED";
  const closed = status === "CLOSED";
  const currentIndex = orderPipeline.indexOf(status as (typeof orderPipeline)[number]);
  const effectiveIndex = closed ? orderPipeline.length - 1 : currentIndex;

  if (variant === "steps") {
    return (
      <div className={cn("min-w-0", className)}>
        <ol className="flex min-w-0 items-start">
          {orderPipeline.map((stage, index) => {
            const done = !cancelled && index < effectiveIndex;
            const current = !cancelled && index === effectiveIndex;
            const reached = done || current;

            return (
              <li key={stage} className="relative min-w-0 flex-1 text-center">
                {index > 0 ? (
                  <span
                    className={cn(
                      "absolute top-[9px] right-1/2 h-px w-full",
                      reached ? "bg-[var(--color-primary-400)]" : "bg-[var(--color-border-strong)]",
                    )}
                    aria-hidden
                  />
                ) : null}
                <span
                  title={orderStatusHintFor(stage)}
                  className={cn(
                    "relative z-[1] mx-auto flex size-[19px] items-center justify-center rounded-full border text-[11px] font-bold",
                    done &&
                      "border-[var(--color-primary-400)] bg-[var(--color-primary-400)] text-[var(--color-on-primary)]",
                    current &&
                      "border-[var(--color-primary-700)] bg-[var(--color-primary-700)] text-[var(--color-on-primary)] ring-4 ring-[var(--color-primary-100)]",
                    !reached &&
                      "border-[var(--color-border-strong)] bg-[var(--color-surface)] text-transparent",
                    cancelled &&
                      "border-[var(--color-danger-text)] bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
                  )}
                >
                  {reached ? "✓" : "·"}
                </span>
                <span
                  className={cn(
                    "mt-1.5 block truncate px-1 text-[10.5px] leading-4",
                    current
                      ? "font-semibold text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-secondary)]",
                  )}
                >
                  {pipelineShortLabel[stage] ?? orderStatusLabel[stage] ?? stage}
                </span>
              </li>
            );
          })}
        </ol>
        {cancelled ? (
          <p className="mt-2 text-[12px] font-semibold text-[var(--color-danger-text)]">Скасовано</p>
        ) : nextTitle ? (
          <p className="type-body-secondary mt-2">{nextTitle}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      <ol className="flex w-full min-w-0">
        {orderPipeline.map((stage, index) => {
          const isFirst = index === 0;
          const isLast = index === orderPipeline.length - 1;
          const done = !cancelled && index < effectiveIndex;
          const current = !cancelled && index === effectiveIndex;

          return (
            <li
              key={stage}
              className="relative min-w-max flex-1"
              style={{
                marginLeft: isFirst ? 0 : -CHEVRON / 2,
                zIndex: current ? 20 : done ? 10 : 1,
              }}
            >
              <div
                title={orderStatusHintFor(stage)}
                className={cn(
                  "flex h-8 items-center justify-center text-center text-[10px] font-semibold leading-none",
                  done && "bg-[var(--color-primary-100)] text-[var(--color-primary-800)]",
                  current && "bg-[var(--color-primary-700)] text-[var(--color-on-primary)]",
                  !done &&
                    !current &&
                    "bg-[var(--color-surface-subtle)] text-[var(--color-text-tertiary)]",
                  cancelled && "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
                )}
                style={{
                  clipPath: pipelineClip(isFirst, isLast),
                  paddingLeft: isFirst ? 8 : CHEVRON + 2,
                  paddingRight: isLast ? 8 : CHEVRON + 2,
                }}
              >
                <span className="whitespace-nowrap">
                  {pipelineShortLabel[stage] ?? orderStatusLabel[stage] ?? stage}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      {cancelled ? (
        <p className="mt-2 text-[12px] font-semibold text-[var(--color-danger-text)]">Скасовано</p>
      ) : nextTitle ? (
        <p className="mt-2 text-[12px] leading-4 text-[var(--color-text-secondary)]">{nextTitle}</p>
      ) : null}
    </div>
  );
}

export function OrderHeaderSection({
  icon,
  title,
  children,
  plain = false,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
  /** Sit inside a parent surface instead of drawing its own card. */
  plain?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0",
        plain
          ? "rounded-[var(--radius-control)] border border-[var(--color-border)] p-3.5"
          : "rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[var(--color-text-primary)]">
        {icon ? <span className="text-[var(--color-text-secondary)]">{icon}</span> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Layout wrapper only. Individual work groups own their surfaces. */
export function OrderWorkspaceShell({
  header,
  facts,
  pipeline,
  footer,
  className,
}: {
  header: React.ReactNode;
  facts?: React.ReactNode;
  pipeline?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "space-y-3",
        className,
      )}
    >
      <div>{header}</div>
      {facts}
      {pipeline ? (
        <div>{pipeline}</div>
      ) : null}
      {footer ? (
        <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 shadow-[var(--shadow-card)]">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

/** Section card with icon title (CRM «Contact Information» block). */
export function OrderDetailSection({
  icon,
  title,
  action,
  children,
  className,
  dense = false,
}: {
  icon?: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Compact chrome for secondary context (client / terms), not the main workspace. */
  dense?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]",
        dense ? "px-3 py-2.5 sm:px-3.5" : "p-4 sm:p-5",
        className,
      )}
    >
      <header
        className={cn(
          "flex items-center justify-between gap-3",
          dense ? "mb-2" : "mb-4",
        )}
      >
        <div className={cn("flex min-w-0 items-center", dense ? "gap-2" : "gap-2.5")}>
          {icon ? (
            <span
              className={cn(
                "flex shrink-0 items-center justify-center rounded-full bg-[var(--color-tint-sage)] text-[var(--color-primary-700)]",
                dense ? "h-7 w-7" : "h-8 w-8",
              )}
            >
              {icon}
            </span>
          ) : null}
          <h2 className="type-subsection">{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function OrderFieldGrid({
  fields,
  columns = 4,
  className,
}: {
  fields: Array<{
    label: string;
    value: React.ReactNode;
    editHref?: string;
    editLabel?: string;
  }>;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {fields.map((field) => (
        <div key={field.label} className="min-w-0">
          <dt className="type-caption">{field.label}</dt>
          <dd className="mt-1 flex min-w-0 items-start gap-1.5">
            <span className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug text-[var(--color-text-primary)]">
              {field.value}
            </span>
            {field.editHref ? (
              <Link
                href={field.editHref}
                className="mt-0.5 shrink-0 text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-primary-600)]"
                aria-label={field.editLabel ?? `Редагувати ${field.label.toLowerCase()}`}
              >
                <IconEdit size={14} />
              </Link>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Tab content wrapper under ViewTabs. */
export function OrderWorkspacePanel({
  tabs,
  children,
  className,
}: {
  tabs: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className="border-b border-[var(--color-border)] px-4 pt-3 sm:px-5">{tabs}</div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
