"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { IconCheck, IconChevronDown, IconSearch } from "@/components/ui/Icons";
import { paletteCatalogForSupplier } from "@/lib/supplier-palettes";
import {
  mergeColorLists,
  normalizeColorLabel,
  rememberCustomColorSwatch,
  swatchForColorLabel,
} from "@/lib/trim-colors";
import { cn } from "@/lib/utils";

function labelsMatch(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Compact palette: selected chips + dropdown with searchable checkboxes.
 */
export function SupplierPaletteEditor({
  value,
  onChange,
  supplierNameUk,
}: {
  value: string;
  onChange: (nextCsv: string) => void;
  supplierNameUk?: string | null;
}) {
  const listId = useId();
  const colors = useMemo(() => mergeColorLists(value.split(",")), [value]);
  const [draftName, setDraftName] = useState("");
  const [draftSwatch, setDraftSwatch] = useState("#4B5563");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [extras, setExtras] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const { colors: baseCatalog } = useMemo(
    () => paletteCatalogForSupplier(supplierNameUk),
    [supplierNameUk],
  );

  useEffect(() => {
    const custom = colors.filter(
      (label) => !baseCatalog.some((row) => labelsMatch(row, label)),
    );
    if (custom.length === 0) return;
    setExtras((prev) => mergeColorLists(prev, custom));
  }, [colors, baseCatalog]);

  const pool = useMemo(
    () => mergeColorLists(baseCatalog, extras, colors),
    [baseCatalog, extras, colors],
  );

  const selectedKeys = useMemo(
    () => new Set(colors.map((label) => label.toLowerCase())),
    [colors],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? pool.filter((label) => label.toLowerCase().includes(q))
      : pool;
    const selectedSet = new Set(colors.map((label) => label.toLowerCase()));
    const top = colors.filter((label) =>
      filtered.some((row) => labelsMatch(row, label)),
    );
    const rest = filtered.filter((label) => !selectedSet.has(label.toLowerCase()));
    return [...top, ...rest];
  }, [pool, query, colors]);

  const allVisibleSelected =
    visible.length > 0 && visible.every((label) => selectedKeys.has(label.toLowerCase()));

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const update = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const gutter = 8;
      const maxH = 320;
      const spaceBelow = window.innerHeight - rect.bottom - gutter;
      const spaceAbove = rect.top - gutter;
      const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
      const available = openUp ? spaceAbove : spaceBelow;
      setMenuStyle({
        position: "fixed",
        left: Math.min(rect.left, window.innerWidth - Math.max(rect.width, 280) - gutter),
        width: Math.min(Math.max(rect.width, 280), window.innerWidth - gutter * 2),
        zIndex: 230,
        maxHeight: Math.min(maxH, Math.max(available, 160)),
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 }),
      });
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
    setQuery("");
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function commit(next: string[]) {
    onChange(next.join(", "));
  }

  function toggle(label: string, checked: boolean) {
    const canonical = normalizeColorLabel(label) ?? label.trim();
    if (!canonical) return;
    if (checked) {
      if (colors.some((row) => labelsMatch(row, canonical))) return;
      commit(mergeColorLists(colors, [canonical]));
      return;
    }
    commit(colors.filter((row) => !labelsMatch(row, canonical)));
  }

  function removeAt(index: number) {
    commit(colors.filter((_, i) => i !== index));
  }

  function selectAllVisible() {
    commit(mergeColorLists(colors, visible));
  }

  function clearAll() {
    if (query.trim()) {
      const drop = new Set(visible.map((label) => label.toLowerCase()));
      commit(colors.filter((label) => !drop.has(label.toLowerCase())));
      return;
    }
    commit([]);
  }

  function addCustom() {
    const label = normalizeColorLabel(draftName);
    if (!label) return;
    rememberCustomColorSwatch(label, draftSwatch);
    if (!baseCatalog.some((row) => labelsMatch(row, label))) {
      setExtras((prev) => mergeColorLists(prev, [label]));
    }
    if (!colors.some((row) => labelsMatch(row, label))) {
      commit(mergeColorLists(colors, [label]));
    }
    setDraftName("");
    setDraftSwatch("#4B5563");
  }

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={listId}
            style={menuStyle}
            className="flex flex-col overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-panel)]"
          >
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--color-divider)] px-2 py-1.5">
              <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-2 py-1">
                <IconSearch size={13} className="shrink-0 text-[var(--color-text-tertiary)]" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Пошук…"
                  className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[var(--color-text-quiet)]"
                  aria-label="Пошук кольору"
                />
              </label>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={visible.length === 0 || allVisibleSelected}
                onClick={selectAllVisible}
              >
                Усі
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={colors.length === 0}
                onClick={clearAll}
              >
                Зняти
              </Button>
            </div>

            <ul
              className="min-h-0 flex-1 overflow-y-auto py-0.5"
              role="listbox"
              aria-multiselectable
              aria-label="Палітра кольорів"
            >
              {visible.length === 0 ? (
                <li className="px-3 py-2.5 text-[12.5px] text-[var(--color-text-quiet)]">
                  Нічого не знайдено
                </li>
              ) : (
                visible.map((label) => {
                  const swatch = swatchForColorLabel(label);
                  const checked = selectedKeys.has(label.toLowerCase());
                  return (
                    <li key={label}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={checked}
                        onClick={() => toggle(label, !checked)}
                        className={cn(
                          "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
                          checked
                            ? "bg-[var(--color-tint-sage)]/70 text-[var(--color-primary-800)]"
                            : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                            checked
                              ? "on-primary border-[var(--color-primary-600)] bg-[var(--color-primary-600)]"
                              : "border-[var(--color-border-strong)] bg-[var(--color-surface)]",
                          )}
                          aria-hidden
                        >
                          {checked ? <IconCheck size={11} /> : null}
                        </span>
                        <span
                          className={cn(
                            "size-3.5 shrink-0 rounded-full ring-1 ring-black/12",
                            swatch.bordered && "border border-[var(--color-border-strong)]",
                          )}
                          style={{ backgroundColor: swatch.swatch }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-[var(--color-divider)] px-2 py-1.5">
              <input
                type="color"
                value={draftSwatch}
                onChange={(event) => setDraftSwatch(event.target.value)}
                className="h-7 w-8 shrink-0 cursor-pointer rounded-[5px] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-0.5"
                aria-label="Зразок кольору"
                title="Зразок"
              />
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Новий колір…"
                aria-label="Назва кольору"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustom();
                  }
                }}
                className="h-7 min-w-[7rem] flex-1 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[12.5px] outline-none focus:border-[var(--color-primary-500)]"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!draftName.trim()}
                onClick={addCustom}
              >
                Додати
              </Button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="sm:col-span-full space-y-2">
      {colors.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {colors.map((label, index) => {
            const swatch = swatchForColorLabel(label);
            return (
              <span
                key={`${label}-${index}`}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] py-0.5 pl-1.5 pr-1 text-[11.5px] font-medium text-[var(--color-text-primary)]"
              >
                <span
                  className={cn(
                    "size-3.5 shrink-0 rounded-full ring-1 ring-black/12",
                    swatch.bordered && "border border-[var(--color-border-strong)]",
                  )}
                  style={{ backgroundColor: swatch.swatch }}
                  aria-hidden
                />
                <span className="min-w-0 truncate" title={label}>
                  {label}
                </span>
                <button
                  type="button"
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[13px] leading-none text-[var(--color-text-tertiary)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)]"
                  onClick={() => removeAt(index)}
                  aria-label={`Прибрати ${label}`}
                  title="Прибрати"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex h-8 w-full min-w-0 items-center gap-2 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-left text-[12.5px] outline-none transition-colors",
          "hover:border-[var(--color-border-strong)] focus:border-[var(--color-primary-500)] focus:ring-1 focus:ring-[var(--color-primary-100)]",
          open && "border-[var(--color-primary-500)] ring-1 ring-[var(--color-primary-100)]",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-[var(--color-text-secondary)]">
          {colors.length > 0
            ? `Обрано ${colors.length} · змінити…`
            : "Обрати кольори з палітри…"}
        </span>
        <IconChevronDown
          size={14}
          className={cn(
            "shrink-0 text-[var(--color-text-tertiary)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {menu}
    </div>
  );
}
