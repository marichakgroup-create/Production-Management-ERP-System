"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";
import { richTextIsEmpty, sanitizeRichHtml } from "@/lib/rich-text";

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

function htmlFromEditor(el: HTMLDivElement | null): string {
  const next = sanitizeRichHtml(el?.innerHTML ?? "");
  return richTextIsEmpty(next) ? "" : next;
}

export type MiniRichTextHandle = {
  getHtml: () => string;
};

export const MiniRichText = forwardRef<
  MiniRichTextHandle,
  {
    value?: string | null;
    onChange?: (html: string) => void;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
    /** Default true. Set false when a parent Save button commits the value. */
    saveOnBlur?: boolean;
    autoFocus?: boolean;
  }
>(function MiniRichText(
  {
    value,
    onChange,
    disabled,
    placeholder = "Коментар",
    className,
    saveOnBlur = true,
    autoFocus = false,
  },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const html = sanitizeRichHtml(value);

  useImperativeHandle(ref, () => ({
    getHtml: () => htmlFromEditor(editorRef.current),
  }));

  useEffect(() => {
    const el = editorRef.current;
    if (!el || disabled) return;
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [html, disabled]);

  useEffect(() => {
    if (disabled || !autoFocus) return;
    editorRef.current?.focus();
  }, [autoFocus, disabled]);

  if (disabled) {
    if (richTextIsEmpty(html)) return null;
    return (
      <div
        className={cn("mini-rich-view type-caption", className)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-white", className)}>
      <div className="flex items-center gap-0.5 border-b border-[var(--color-divider)] px-1 py-0.5">
        <MarkButton
          label="Жирний"
          onClick={() => {
            exec("bold");
            editorRef.current?.focus();
          }}
        >
          <span className="font-bold">Ж</span>
        </MarkButton>
        <MarkButton
          label="Курсив"
          onClick={() => {
            exec("italic");
            editorRef.current?.focus();
          }}
        >
          <span className="italic">К</span>
        </MarkButton>
        <MarkButton
          label="Абзац"
          onClick={() => {
            exec("formatBlock", "p");
            editorRef.current?.focus();
          }}
        >
          ¶
        </MarkButton>
        <MarkButton
          label="Список"
          onClick={() => {
            exec("insertUnorderedList");
            editorRef.current?.focus();
          }}
        >
          •
        </MarkButton>
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-label={placeholder}
        data-placeholder={placeholder}
        className="mini-rich-edit min-h-[4.5rem] px-2 py-1.5 text-[13px] text-[var(--color-text-primary)] outline-none empty:before:text-[var(--color-text-quiet)] empty:before:content-[attr(data-placeholder)]"
        onBlur={() => {
          if (!saveOnBlur || !onChange) return;
          const next = htmlFromEditor(editorRef.current);
          if (next === html) return;
          onChange(next);
        }}
      />
    </div>
  );
});

function MarkButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
      className="inline-flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
    >
      {children}
    </button>
  );
}
