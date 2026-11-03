import { cn } from "@/lib/utils";

type FieldShellProps = {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Sit the label on the control’s top border instead of a row above it. */
  labelOnBorder?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function FieldShell({
  label,
  hint,
  error,
  required,
  optional,
  labelOnBorder,
  className,
  children,
}: FieldShellProps & { optional?: boolean }) {
  const labelText = label ? (
    <span>
      {label}
      {required ? <span className="ml-0.5 text-[var(--color-danger-text)]">*</span> : null}
    </span>
  ) : null;

  if (labelOnBorder) {
    return (
      <label className={cn("relative block w-full pt-1.5", className)}>
        {labelText ? (
          <span className="pointer-events-none absolute top-1.5 left-2 z-[1] -translate-y-1/2 bg-[var(--color-surface)] px-1 text-[10.5px] leading-none font-medium text-[var(--color-text-tertiary)]">
            {labelText}
          </span>
        ) : null}
        {children}
        {error ? <span className="mt-1 block text-[12px] text-[var(--color-danger-text)]">{error}</span> : null}
        {!error && hint ? <span className="type-caption mt-1 block">{hint}</span> : null}
      </label>
    );
  }

  return (
    <label className={cn("flex w-full flex-col gap-1", className)}>
      {labelText ? (
        <span className="type-label inline-flex flex-wrap items-baseline gap-1.5">
          {labelText}
          {optional && !required ? (
            <span className="text-[12px] font-normal tracking-normal text-[var(--color-text-secondary)] normal-case">
              необовʼязково
            </span>
          ) : null}
        </span>
      ) : null}
      {children}
      {error ? <span className="text-[12px] text-[var(--color-danger-text)]">{error}</span> : null}
      {!error && hint ? <span className="type-caption">{hint}</span> : null}
    </label>
  );
}

export const controlClass =
  "h-10 w-full rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-[14px] text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-primary-500)] focus:ring-2 focus:ring-[var(--color-focus-ring)] disabled:bg-[var(--color-surface-subtle)] disabled:text-[var(--color-text-tertiary)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export { Select } from "@/components/ui/Select";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string;
  /** Extra classes for the control itself; `className` lays out the field in a grid. */
  textareaClassName?: string;
};

export function Textarea({
  className,
  textareaClassName,
  label,
  hint,
  error,
  required,
  ...props
}: TextareaProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} className={className}>
      <textarea
        className={cn(controlClass, "h-auto min-h-20 py-2 leading-relaxed", textareaClassName)}
        required={required}
        {...props}
      />
    </FieldShell>
  );
}

/** Grouped form block with uppercase group label (ref6 pattern). */
export function FormGroup({
  label,
  description,
  action,
  icon,
  columns = 2,
  compact = false,
  children,
  className,
}: {
  label?: string;
  description?: string;
  action?: React.ReactNode;
  /** Small domain icon shown beside the group label. */
  icon?: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
  /** Tighter gaps for short labels / dense side panels. */
  compact?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(compact ? "space-y-1.5" : "space-y-2.5", className)}>
      {(label || action || icon) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {label || icon ? (
              <h3 className="type-group-label flex items-center gap-1.5">
                {icon ? (
                  <span className="inline-flex text-[var(--color-text-secondary)]">{icon}</span>
                ) : null}
                {label ? <span>{label}</span> : null}
              </h3>
            ) : null}
            {description ? (
              <p className={cn("type-caption mt-0.5", icon && "pl-[22px]")}>{description}</p>
            ) : null}
          </div>
          {action}
        </div>
      )}
      <div
        className={cn(
          "grid",
          compact ? "gap-2" : "gap-3",
          columns === 1 && "grid-cols-1",
          columns === 2 && "grid-cols-1 sm:grid-cols-2",
          columns === 3 &&
            (compact
              ? "grid-cols-2 sm:grid-cols-3"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"),
          columns === 4 && "grid-cols-2 lg:grid-cols-4",
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function Checkbox({
  label,
  description,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-subtle)]",
        className,
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-primary-600)]"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-[var(--color-text-primary)]">{label}</span>
        {description ? <span className="type-caption block">{description}</span> : null}
      </span>
    </label>
  );
}
