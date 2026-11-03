import { cn } from "@/lib/utils";
import { controlClass, FieldShell } from "@/components/ui/Field";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
  /** Extra classes for the input element itself; `className` lays out the field in a grid. */
  inputClassName?: string;
  /** Fixed trailing adornment (e.g. ₴, $) on the right inside the control. */
  suffix?: React.ReactNode;
  /** Show quiet «необовʼязково» when not required. */
  optional?: boolean;
  /** Sit the label on the control’s top border. */
  labelOnBorder?: boolean;
};

export function Input({
  className,
  inputClassName,
  label,
  error,
  hint,
  required,
  optional,
  labelOnBorder,
  id,
  readOnly,
  disabled,
  suffix,
  ...props
}: InputProps) {
  const control = (
    <input
      id={id ?? props.name}
      required={required}
      readOnly={readOnly}
      disabled={disabled}
      className={cn(
        controlClass,
        error && "border-[var(--color-danger-text)] focus:ring-[var(--color-danger-text)]",
        (readOnly || disabled) &&
          "cursor-default border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] focus:border-[var(--color-border)] focus:ring-0",
        disabled && "opacity-70",
        suffix && "pr-11",
        inputClassName,
      )}
      {...props}
    />
  );

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      optional={optional}
      labelOnBorder={labelOnBorder}
      className={className}
    >
      {suffix ? (
        <div className="relative">
          {control}
          <span
            className="pointer-events-none absolute inset-y-0 right-0 flex min-w-9 items-center justify-center px-2.5 text-[12.5px] font-medium tabular-nums text-[var(--color-text-tertiary)]"
            aria-hidden
          >
            {suffix}
          </span>
        </div>
      ) : (
        control
      )}
    </FieldShell>
  );
}
