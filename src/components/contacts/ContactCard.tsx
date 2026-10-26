"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { SoftBusy } from "@/components/ui/SoftBusy";
import { cn } from "@/lib/utils";

export type ContactField = {
  key: string;
  label: string;
  value: string;
  kind?: "text" | "tel" | "email" | "url" | "number";
  placeholder?: string;
  required?: boolean;
  wide?: boolean;
};

const controlCompact = cn(
  "h-8 w-full rounded-[var(--radius-control)] border border-[var(--color-border)]",
  "bg-[var(--color-surface)] px-2.5 text-[13px] text-[var(--color-text-primary)] outline-none transition-colors",
  "placeholder:text-[var(--color-text-quiet)]",
  "hover:border-[var(--color-border-strong)]",
  "focus:border-[var(--color-primary-500)] focus:ring-2 focus:ring-[var(--color-focus-ring)]",
  "disabled:bg-[var(--color-surface-subtle)] disabled:text-[var(--color-text-tertiary)]",
);

/**
 * Mini contact card — Panel tokens, dense fields, no chrome noise.
 * Name lives in the header (editable); body = essentials only.
 */
export function ContactCard({
  title,
  titleKey,
  meta,
  href,
  detailLabel = "Детальніше",
  fields,
  below,
  disabled,
  onSave,
}: {
  title: string;
  /** When set, header name is an editable field with this key. */
  titleKey?: string;
  meta?: React.ReactNode;
  href?: string;
  detailLabel?: string;
  fields: ContactField[];
  /** Nested block under company fields (e.g. contact people). */
  below?: React.ReactNode;
  disabled?: boolean;
  onSave: (values: Record<string, string>) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const allKeys = [
    ...(titleKey ? [{ key: titleKey, value: title }] : []),
    ...fields.map((f) => ({ key: f.key, value: f.value })),
  ];
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(allKeys.map((f) => [f.key, f.value])),
  );
  const [error, setError] = useState<string | null>(null);

  const fieldSignature = [
    titleKey ? `${titleKey}=${title}` : "",
    ...fields.map((f) => `${f.key}=${f.value}`),
  ].join("\n");

  useEffect(() => {
    setDraft(
      Object.fromEntries([
        ...(titleKey ? [[titleKey, title] as const] : []),
        ...fields.map((f) => [f.key, f.value] as const),
      ]),
    );
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldSignature]);

  const dirty =
    (titleKey ? (draft[titleKey] ?? "") !== title : false) ||
    fields.some((f) => (draft[f.key] ?? "") !== (f.value ?? ""));

  const displayTitle = titleKey ? (draft[titleKey] ?? title) : title;

  function save() {
    if (disabled || !dirty) return;
    setError(null);
    startTransition(async () => {
      const result = await onSave(draft);
      if (!result.ok) {
        setError(result.error === "VALIDATION" ? "Перевірте поля." : "Не вдалося зберегти.");
        return;
      }
      router.refresh();
    });
  }

  function reset() {
    setDraft(
      Object.fromEntries([
        ...(titleKey ? [[titleKey, title] as const] : []),
        ...fields.map((f) => [f.key, f.value] as const),
      ]),
    );
    setError(null);
  }

  return (
    <SoftBusy busy={pending} tone="inline" className="min-w-0">
      <article
        className={cn(
          "flex h-full flex-col rounded-[var(--radius-surface)] border bg-[var(--color-surface)] shadow-[var(--shadow-card)]",
          dirty ? "border-[var(--color-primary-300)]" : "border-[var(--color-border)]",
        )}
      >
        <header className="flex items-start gap-2 border-b border-[var(--color-divider)] px-3 py-2.5">
          <div className="min-w-0 flex-1">
            {titleKey && !disabled ? (
              <input
                aria-label="Назва"
                disabled={pending}
                className={cn(
                  "type-subsection w-full truncate border-0 bg-transparent p-0 outline-none",
                  "placeholder:text-[var(--color-text-quiet)]",
                  "focus:text-[var(--color-primary-800)]",
                )}
                value={displayTitle}
                placeholder="Назва"
                required
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, [titleKey]: event.target.value }))
                }
              />
            ) : href ? (
              <Link
                href={href}
                className="type-subsection block truncate hover:text-[var(--color-primary-700)]"
              >
                {displayTitle}
              </Link>
            ) : (
              <h3 className="type-subsection truncate">{displayTitle}</h3>
            )}
            {meta != null && meta !== "" ? (
              <p className="type-caption mt-0.5 tabular text-[var(--color-text-tertiary)]">
                {meta}
              </p>
            ) : null}
          </div>
          {href ? (
            <Link
              href={href}
              className={cn(
                "inline-flex h-8 shrink-0 items-center justify-center rounded-[var(--radius-control)]",
                "border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5",
                "text-[12px] font-semibold text-[var(--color-text-primary)] transition-colors",
                "hover:bg-[var(--color-surface-subtle)]",
              )}
            >
              {detailLabel}
            </Link>
          ) : null}
        </header>

        <div className="flex flex-1 flex-col">
          <div className="grid grid-cols-2 gap-x-2 gap-y-2 px-3 py-2.5">
            {fields.map((field) => (
              <label
                key={field.key}
                className={cn("flex min-w-0 flex-col gap-0.5", field.wide && "col-span-2")}
              >
                <span className="type-label">
                  {field.label}
                  {field.required ? (
                    <span className="ml-0.5 text-[var(--color-danger-text)]">*</span>
                  ) : null}
                </span>
                <input
                  type={
                    field.kind === "number"
                      ? "number"
                      : field.kind === "url"
                        ? "url"
                        : field.kind ?? "text"
                  }
                  disabled={disabled || pending}
                  className={controlCompact}
                  value={draft[field.key] ?? ""}
                  placeholder={field.placeholder}
                  required={field.required}
                  step={field.kind === "number" ? "any" : undefined}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                />
              </label>
            ))}
          </div>
          {below ? (
            <div className="border-t border-[var(--color-divider)] px-3 pb-2.5">{below}</div>
          ) : null}
        </div>

        {(error || dirty) && !disabled ? (
          <footer className="mt-auto flex items-center gap-2 border-t border-[var(--color-divider)] px-3 py-2">
            {error ? (
              <span className="type-caption text-[var(--color-danger-text)]">{error}</span>
            ) : null}
            <div className="ml-auto flex gap-1.5">
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={reset}>
                Скасувати
              </Button>
              <Button type="button" size="sm" disabled={pending || !dirty} onClick={save}>
                {pending ? "…" : "Зберегти"}
              </Button>
            </div>
          </footer>
        ) : null}
      </article>
    </SoftBusy>
  );
}

export function ContactCardsGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
  );
}
