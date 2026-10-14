import Link from "next/link";
import { cn } from "@/lib/utils";

export function TableCard({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Inline “add row” strip under catalog tables (materials / ops / decorations). */
export const TABLE_ADD_FOOTER_CLASS =
  "border-t border-[var(--color-divider)] bg-[var(--color-surface-subtle)] px-3 py-2.5";

export function TableAddFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(TABLE_ADD_FOOTER_CLASS, "flex flex-wrap items-end gap-2", className)}>
      {children}
    </div>
  );
}

/**
 * Toolbar above a table. Prefer putting SearchField + FilterChips in `filters`
 * so density stays readable; `left` is for title/count, `right` for actions.
 */
export function TableToolbar({
  left,
  right,
  filters,
  className,
}: {
  left?: React.ReactNode;
  right?: React.ReactNode;
  filters?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-[var(--color-border)]", className)}>
      {(left || right) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-3.5 py-2.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{left}</div>
          <div className="ml-auto flex shrink-0 flex-wrap items-start justify-end gap-2">{right}</div>
        </div>
      )}
      {filters ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 bg-[var(--color-tint-slate)] px-3.5 py-2",
            (left || right) && "border-t border-[var(--color-divider)]",
          )}
        >
          {filters}
        </div>
      ) : null}
    </div>
  );
}

export function Table({
  children,
  className,
  scrollClassName,
}: {
  children: React.ReactNode;
  className?: string;
  /** Extra classes on the overflow scroller (e.g. max-height for sticky thead). */
  scrollClassName?: string;
}) {
  return (
    <div className={cn("table-scroll max-w-full overflow-x-auto", scrollClassName)}>
      <table className={cn("erp-table w-full border-collapse text-[13px]", className)}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-[3] bg-[var(--color-surface)]">
      <tr className="border-b border-[var(--color-divider)]">{children}</tr>
    </thead>
  );
}

/**
 * `stickyRight` / `stickyLeft` pin columns while the table scrolls horizontally.
 * `stickyLeft` accepts `true` (left: 0) or a CSS offset for stacked pins (e.g. "40px").
 */
export function TH({
  children,
  align = "left",
  width,
  stickyRight,
  stickyLeft,
  className,
  title,
  style,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  stickyRight?: boolean;
  stickyLeft?: boolean | string;
  className?: string;
  title?: string;
  style?: React.CSSProperties;
}) {
  const leftOffset = stickyLeft === true ? 0 : stickyLeft || undefined;
  return (
    <th
      title={title}
      style={{
        ...(width ? { width } : null),
        ...(leftOffset != null ? { left: leftOffset } : null),
        ...style,
      }}
      className={cn(
        "whitespace-nowrap px-3 py-2 text-[11px] font-medium tracking-[0.04em] text-[var(--color-text-quiet)] uppercase",
        title && "cursor-help",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        stickyRight &&
          "is-pinned-right sticky right-0 z-[4] border-l border-[var(--color-divider)] bg-[var(--color-surface)]",
        stickyLeft != null && stickyLeft !== false &&
          "is-pinned-left sticky z-[4] border-r border-[var(--color-divider)] bg-[var(--color-surface)]",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="bg-[var(--color-surface)]">{children}</tbody>;
}

/** In-table section divider (Матеріали, Операції, …). */
export function TableSectionHeader({
  title,
  colSpan = 4,
  first = false,
}: {
  title: string;
  colSpan?: number;
  first?: boolean;
}) {
  return (
    <TR className="pointer-events-none hover:bg-transparent">
      <TD
        colSpan={colSpan}
        className={cn(
          "table-section-header !border-b-0 !py-2.5 !px-3 !text-[11px]",
          !first && "border-t border-[var(--color-table-section-border)]",
        )}
      >
        {title}
      </TD>
    </TR>
  );
}

/** Subtotal row at the end of an in-table section (Разом матеріали, …). */
export function TableSectionSubtotal({
  label,
  perUnit,
  total,
  colSpan = 2,
}: {
  label: string;
  perUnit: React.ReactNode;
  total: React.ReactNode;
  colSpan?: number;
}) {
  const cellClass =
    "table-section-subtotal group-hover:bg-[var(--color-table-subtotal-bg)] hover:bg-[var(--color-table-subtotal-bg)]";
  return (
    <TR className="pointer-events-none hover:bg-[var(--color-table-subtotal-bg)]">
      <TD colSpan={colSpan} className={cellClass}>
        {label}
      </TD>
      <TD numeric className={cellClass}>
        {perUnit}
      </TD>
      <TD numeric className={cn(cellClass, "!font-semibold !text-[var(--color-text-primary)]")}>
        {total}
      </TD>
    </TR>
  );
}

export function TR({
  children,
  className,
  muted,
  selected,
  style,
  onClick,
  onDragOver,
  onDrop,
  onDragLeave,
}: {
  children: React.ReactNode;
  className?: string;
  muted?: boolean;
  selected?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
  onDragOver?: (event: React.DragEvent<HTMLTableRowElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLTableRowElement>) => void;
  onDragLeave?: (event: React.DragEvent<HTMLTableRowElement>) => void;
}) {
  return (
    <tr
      data-selected={selected ? "true" : undefined}
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
      style={style}
      className={cn(
        "group border-b border-[var(--color-divider)] transition-colors last:border-0 hover:bg-[var(--color-surface-hover)]",
        muted && "text-[var(--color-text-tertiary)]",
        selected && "bg-[var(--color-tint-slate)] hover:bg-[var(--color-tint-slate)]",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  align = "left",
  numeric,
  nowrap,
  stickyRight,
  stickyLeft,
  className,
  colSpan,
  title,
  onClick,
  style,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  numeric?: boolean;
  nowrap?: boolean;
  stickyRight?: boolean;
  stickyLeft?: boolean | string;
  className?: string;
  colSpan?: number;
  title?: string;
  onClick?: (event: React.MouseEvent<HTMLTableCellElement>) => void;
  style?: React.CSSProperties;
}) {
  const leftOffset = stickyLeft === true ? 0 : stickyLeft || undefined;
  return (
    <td
      colSpan={colSpan}
      title={title}
      onClick={onClick}
      style={{
        ...(leftOffset != null ? { left: leftOffset } : null),
        ...style,
      }}
      className={cn(
        "px-3 py-2 align-middle text-[13px] font-normal text-[var(--color-text-secondary)]",
        align === "right" && "text-right",
        align === "center" && "text-center",
        numeric && "tabular text-right whitespace-nowrap text-[var(--color-text-secondary)]",
        nowrap && "whitespace-nowrap",
        stickyRight &&
          "is-pinned-right sticky right-0 z-[1] border-l border-[var(--color-divider)] bg-[var(--color-surface)] transition-colors group-hover:bg-[var(--color-surface-hover)] group-data-[selected=true]:bg-[var(--color-tint-slate)]",
        stickyLeft != null && stickyLeft !== false &&
          "is-pinned-left sticky z-[1] border-r border-[var(--color-divider)] bg-[var(--color-surface)] transition-colors group-hover:bg-[var(--color-surface-hover)] group-data-[selected=true]:bg-[var(--color-tint-slate)]",
        className,
      )}
    >
      {children}
    </td>
  );
}

/**
 * Primary cell content: a title line with an optional muted second line.
 * By default long names truncate to one line; pass `wrap` to use available column width.
 */
export function CellStack({
  title,
  subtitle,
  href,
  maxWidth,
  wrap = false,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  href?: string;
  maxWidth?: string;
  wrap?: boolean;
}) {
  const effectiveMaxWidth = maxWidth ?? (wrap ? undefined : "220px");
  const titleClass = cn(
    "font-medium text-[var(--color-text-primary)]",
    wrap ? "break-words [overflow-wrap:anywhere]" : "truncate",
  );

  return (
    <div
      style={effectiveMaxWidth ? { maxWidth: effectiveMaxWidth } : undefined}
      className={cn("min-w-0", wrap && "max-w-none")}
    >
      {href ? (
        <Link href={href} className={cn("block hover:text-[var(--color-primary-700)] hover:underline", titleClass)}>
          {title}
        </Link>
      ) : (
        <div className={titleClass}>{title}</div>
      )}
      {subtitle ? (
        <div
          className={cn(
            "mt-0.5 text-[12px] font-normal text-[var(--color-text-quiet)]",
            wrap ? "break-words [overflow-wrap:anywhere]" : "truncate",
          )}
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

/** Footer row for totals. */
export function TFoot({ children }: { children: React.ReactNode }) {
  return (
    <tfoot className="border-t border-[var(--color-border)] bg-[var(--color-tint-slate)] font-semibold">
      {children}
    </tfoot>
  );
}

export function TableEmpty({
  colSpan,
  title,
  description,
  action,
  icon,
}: {
  colSpan: number;
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10">
        <div className="flex flex-col items-center gap-2.5 text-center">
          {icon ? (
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-tint-sage)] text-[var(--color-primary-700)]"
              aria-hidden
            >
              {icon}
            </div>
          ) : null}
          <div className="space-y-1">
            <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">{title}</p>
            {description ? <p className="type-body-secondary max-w-md">{description}</p> : null}
          </div>
          {action ? <div className="mt-1">{action}</div> : null}
        </div>
      </td>
    </tr>
  );
}

/** Compact row action control (open / edit / overflow). */
export function TableRowButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 items-center justify-center gap-1 rounded-[6px] px-2 text-[12.5px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-tint-slate)] hover:text-[var(--color-text-primary)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
