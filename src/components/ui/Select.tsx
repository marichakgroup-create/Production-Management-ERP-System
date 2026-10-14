"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { IconCheck, IconChevronDown, IconSearch } from "@/components/ui/Icons";

export type SelectOption = {
  value: string;
  label: string;
  /** Secondary line in the dropdown (e.g. material composition). */
  description?: string;
  disabled?: boolean;
  /** Section header in the menu (e.g. «DTF Друк» / «Шовкотрафарет»). */
  group?: string;
};

function labelFromNode(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(labelFromNode).join("");
  if (isValidElement<{ children?: React.ReactNode }>(node)) {
    return labelFromNode(node.props.children);
  }
  return "";
}

function optionsFromChildren(
  children: React.ReactNode,
  group?: string,
): SelectOption[] {
  const options: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (child == null || typeof child === "boolean") return;
    if (
      !isValidElement<{
        value?: string | number;
        disabled?: boolean;
        label?: string;
        children?: React.ReactNode;
        "data-description"?: string;
        "data-group"?: string;
      }>(child)
    ) {
      return;
    }
    if (child.type === Fragment) {
      options.push(...optionsFromChildren(child.props.children, group));
      return;
    }
    if (child.type === "optgroup") {
      const label = String(child.props.label ?? "").trim();
      options.push(...optionsFromChildren(child.props.children, label || group));
      return;
    }
    if (child.type !== "option") return;
    const description = child.props["data-description"]?.trim() || undefined;
    const optionGroup =
      child.props["data-group"]?.trim() || group || undefined;
    options.push({
      value: String(child.props.value ?? ""),
      label: labelFromNode(child.props.children),
      description,
      disabled: Boolean(child.props.disabled),
      group: optionGroup,
    });
  });
  return options;
}

type SelectChangeEvent = { target: { value: string; name?: string } };

type SelectProps = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (event: SelectChangeEvent) => void;
  children?: React.ReactNode;
  options?: SelectOption[];
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
  disabled?: boolean;
  size?: "sm" | "md";
  placeholder?: string;
  className?: string;
  selectClassName?: string;
  id?: string;
  /** Accessibility name when no visible label (e.g. table footers). */
  "aria-label"?: string;
  /** Show search when the list is long. Default: auto at 6+ options. */
  searchable?: boolean;
  /**
   * Hide the selected option’s description under the trigger.
   * Use in compact inline toolbars so h-8 siblings stay aligned.
   */
  hideSelectedDescription?: boolean;
};

function placeMenu(button: HTMLElement): React.CSSProperties {
  const rect = button.getBoundingClientRect();
  const maxH = 320;
  const gutter = 8;
  const spaceBelow = window.innerHeight - rect.bottom - gutter;
  const spaceAbove = rect.top - gutter;
  const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
  const available = openUp ? spaceAbove : spaceBelow;
  return {
    position: "fixed",
    left: Math.min(rect.left, window.innerWidth - Math.max(rect.width, 240) - gutter),
    width: Math.min(Math.max(rect.width, 240), window.innerWidth - gutter * 2),
    zIndex: 220,
    maxHeight: Math.min(maxH, Math.max(available, 120)),
    ...(openUp
      ? { bottom: window.innerHeight - rect.top + 6 }
      : { top: rect.bottom + 6 }),
  };
}

/**
 * Branded combobox used everywhere instead of native <select>.
 */
export function Select({
  name,
  value,
  defaultValue,
  onChange,
  children,
  options: optionsProp,
  label,
  hint,
  error,
  required,
  optional,
  disabled,
  size = "md",
  placeholder,
  className,
  selectClassName,
  id,
  "aria-label": ariaLabel,
  searchable,
  hideSelectedDescription = false,
}: SelectProps) {
  const options = useMemo(
    () => optionsProp ?? optionsFromChildren(children),
    [optionsProp, children],
  );
  const generatedId = useId();
  const fieldId = id ?? name ?? generatedId;
  const listId = `${fieldId}-list`;
  const isControlled = value !== undefined;
  const [uncontrolled, setUncontrolled] = useState(String(defaultValue ?? options[0]?.value ?? ""));
  const selectedValue = isControlled ? String(value) : uncontrolled;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const selected = options.find((option) => option.value === selectedValue);
  const display = selected?.label || placeholder || "Оберіть…";
  const emptySelected = !selected || selected.value === "";
  const withSearch = searchable ?? options.length >= 6;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => {
      if (option.value === "") return false;
      const haystack =
        `${option.group ?? ""} ${option.label} ${option.description ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query]);

  function commit(next: string) {
    if (!isControlled) setUncontrolled(next);
    onChange?.({ target: { value: next, name } });
    setOpen(false);
    setQuery("");
    buttonRef.current?.focus();
  }

  function close() {
    setOpen(false);
    setQuery("");
    buttonRef.current?.focus();
  }

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const update = () => {
      if (buttonRef.current) setMenuStyle(placeMenu(buttonRef.current));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, visible.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const selectedIdx = visible.findIndex((option) => option.value === selectedValue);
    setActiveIndex(selectedIdx >= 0 ? selectedIdx : 0);
  }, [open, selectedValue, visible]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (withSearch) searchRef.current?.focus();
      else listRef.current?.focus();
    });
  }, [open, withSearch]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.querySelectorAll("[data-option]")[activeIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex, open]);

  function onTriggerKey(event: React.KeyboardEvent) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function moveActive(delta: number) {
    setActiveIndex((index) => {
      if (visible.length === 0) return -1;
      const start = index < 0 ? (delta > 0 ? -1 : 0) : index;
      return Math.max(0, Math.min(visible.length - 1, start + delta));
    });
  }

  function onListKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = visible[activeIndex];
      if (option && !option.disabled) commit(option.value);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(visible.length - 1);
    }
  }

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            onKeyDown={onListKey}
            style={menuStyle}
            className="flex flex-col overflow-hidden rounded-[12px] border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-[var(--shadow-float)] ring-1 ring-black/[0.04]"
          >
            {withSearch ? (
              <div className="relative shrink-0 border-b border-[var(--color-divider)] px-2 py-1.5">
                <IconSearch
                  size={14}
                  className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[var(--color-text-quiet)]"
                />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={onListKey}
                  placeholder="Пошук у списку"
                  aria-label="Пошук у списку"
                  className="h-8 w-full rounded-[8px] border-0 bg-[var(--color-surface-subtle)] pr-2.5 pl-8 text-[13px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] focus:ring-2 focus:ring-[var(--color-focus-ring)]"
                />
              </div>
            ) : null}

            <ul className="min-h-0 flex-1 overflow-auto py-1">
              {visible.length === 0 ? (
                <li className="px-3 py-2.5 text-[13px] text-[var(--color-text-tertiary)]">
                  Нічого не знайдено
                </li>
              ) : (
                visible.map((option, index) => {
                  const isSelected = option.value === selectedValue;
                  const isActive = index === activeIndex;
                  const isPlaceholder = option.value === "";
                  const prevGroup = index > 0 ? visible[index - 1]?.group : undefined;
                  const showGroup =
                    Boolean(option.group) && option.group !== prevGroup && !isPlaceholder;
                  return (
                    <Fragment key={`${option.group ?? ""}-${option.value}-${index}`}>
                      {showGroup ? (
                        <li
                          role="presentation"
                          className="sticky top-0 z-[1] mx-1 bg-[var(--color-surface)] px-2.5 pt-2 pb-1 text-[10.5px] font-bold tracking-[0.08em] text-[var(--color-text-tertiary)] uppercase"
                        >
                          {option.group}
                        </li>
                      ) : null}
                      <li
                        data-option
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={option.disabled}
                        className={cn(
                          "mx-1 flex cursor-pointer items-center justify-between gap-2 rounded-[8px] px-2.5 py-1.5 text-[13.5px] leading-snug",
                          option.disabled && "cursor-not-allowed opacity-40",
                          isPlaceholder && "text-[var(--color-text-tertiary)]",
                          isSelected &&
                            "bg-[var(--color-tint-sage)] font-medium text-[var(--color-primary-800)]",
                          !isSelected && isActive && "bg-[var(--color-surface-subtle)]",
                          !isSelected &&
                            !isActive &&
                            "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]",
                        )}
                        onMouseEnter={() => setActiveIndex(index)}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          if (!option.disabled) commit(option.value);
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{option.label}</span>
                          {option.description ? (
                            <span
                              className={cn(
                                "mt-0.5 block truncate text-[11.5px] font-normal",
                                isSelected
                                  ? "text-[var(--color-primary-700)]/80"
                                  : "text-[var(--color-text-quiet)]",
                              )}
                            >
                              {option.description}
                            </span>
                          ) : null}
                        </span>
                        {isSelected && !isPlaceholder ? (
                          <IconCheck size={14} className="shrink-0 text-[var(--color-primary-700)]" />
                        ) : null}
                      </li>
                    </Fragment>
                  );
                })
              )}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={cn("flex w-full min-w-0 flex-col gap-1", className)}>
      {label ? (
        <span className="type-label inline-flex flex-wrap items-baseline gap-1.5" id={`${fieldId}-label`}>
          <span>
            {label}
            {required ? <span className="ml-0.5 text-[var(--color-danger-text)]">*</span> : null}
          </span>
          {optional && !required ? (
            <span className="text-[10.5px] font-normal normal-case tracking-normal text-[var(--color-text-tertiary)]">
              необовʼязково
            </span>
          ) : null}
        </span>
      ) : null}

      {name ? <input type="hidden" name={name} value={selectedValue} required={required} /> : null}

      <button
        ref={buttonRef}
        id={fieldId}
        type="button"
        disabled={disabled}
        aria-label={!label ? ariaLabel : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={label ? `${fieldId}-label` : undefined}
        aria-controls={open ? listId : undefined}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        onKeyDown={onTriggerKey}
        className={cn(
          "inline-flex w-full min-w-0 items-stretch overflow-hidden rounded-[var(--radius-control)] border bg-[var(--color-surface)] text-left outline-none transition-colors",
          size === "sm" ? "h-8" : "h-10",
          disabled
            ? "border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-[var(--color-text-tertiary)]"
            : "border-[var(--color-border-strong)] hover:border-[var(--color-primary-400)]",
          error && "border-[var(--color-danger-text)]",
          open && "border-[var(--color-primary-500)] ring-2 ring-[var(--color-focus-ring)]",
          selectClassName,
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate self-center px-3 text-[14px] text-[var(--color-text-primary)]",
            size === "sm" && "px-2.5 text-[12.5px]",
            emptySelected && "text-[var(--color-text-tertiary)]",
          )}
        >
          {display}
        </span>
        <span
          className={cn(
            "flex w-8 shrink-0 items-center justify-center border-l border-[var(--color-border)] text-[var(--color-text-quiet)]",
            size === "sm" && "w-7",
            open && "border-[var(--color-primary-200)] bg-[var(--color-tint-sage)] text-[var(--color-primary-700)]",
          )}
          aria-hidden
        >
          <IconChevronDown
            size={size === "sm" ? 13 : 15}
            className={cn("transition-transform duration-150", open && "rotate-180")}
          />
        </span>
      </button>

      {error ? <span className="text-[12px] text-[var(--color-danger-text)]">{error}</span> : null}
      {!error && hint ? <span className="type-caption">{hint}</span> : null}
      {!error && !hint && !hideSelectedDescription && selected?.description ? (
        <span className="type-caption">{selected.description}</span>
      ) : null}
      {menu}
    </div>
  );
}
