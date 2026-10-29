"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { IconChevronDown, IconEdit, IconNote, IconTrash } from "@/components/ui/Icons";
import { MiniRichText, type MiniRichTextHandle } from "@/components/ui/MiniRichText";
import { updateOrderCommentAction } from "@/server/domains/orders/actions";
import { cn } from "@/lib/utils";
import { richTextIsEmpty, sanitizeRichHtml } from "@/lib/rich-text";

function previewText(html: string | null | undefined): string {
  const plain = sanitizeRichHtml(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain;
}

export function OrderCommentBlock({
  orderId,
  comment,
  locked,
}: {
  orderId: string;
  comment?: string | null;
  locked?: boolean;
}) {
  const router = useRouter();
  const panelId = useId();
  const editorRef = useRef<MiniRichTextHandle>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const empty = richTextIsEmpty(comment);
  const preview = previewText(comment);
  const expanded = open || editing;

  function commit(next: string) {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("comment", next);
    startTransition(async () => {
      await updateOrderCommentAction(formData);
      setEditing(false);
      setOpen(!richTextIsEmpty(next));
      router.refresh();
    });
  }

  function startAdd() {
    setOpen(true);
    setEditing(true);
  }

  function startEdit() {
    setOpen(true);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    if (empty) setOpen(false);
  }

  function toggle() {
    if (editing) return;
    if (empty && !locked) {
      startAdd();
      return;
    }
    setOpen((prev) => !prev);
  }

  function remove() {
    if (!window.confirm("Видалити коментар до замовлення?")) return;
    commit("");
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          disabled={editing}
          onClick={toggle}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-[8px] py-0.5 text-left outline-none",
            "hover:bg-[var(--color-surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
            editing && "cursor-default hover:bg-transparent",
          )}
        >
          <IconChevronDown
            size={16}
            className={cn(
              "shrink-0 text-[var(--color-text-tertiary)] transition-transform duration-150",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
          <IconNote size={15} className="hidden shrink-0 text-[var(--color-text-tertiary)] sm:block" />
          <span className="type-label shrink-0 text-[var(--color-text-primary)]">Коментар</span>
          {!expanded ? (
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[13px]",
                empty
                  ? "font-normal text-[var(--color-text-tertiary)]"
                  : "text-[var(--color-text-secondary)]",
              )}
            >
              {empty ? "немає примітки" : preview}
            </span>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
        </button>

        {!locked && !editing ? (
          <div className="flex shrink-0 items-center gap-0.5">
            {empty ? (
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={startAdd}>
                Додати
              </Button>
            ) : (
              <>
                <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={startEdit}>
                  <IconEdit size={14} />
                  Змінити
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  aria-label="Видалити коментар"
                  onClick={remove}
                >
                  <IconTrash size={14} />
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div
        id={panelId}
        aria-hidden={!expanded}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-2 pl-7">
            {editing ? (
              <>
                <MiniRichText
                  ref={editorRef}
                  value={comment}
                  saveOnBlur={false}
                  autoFocus
                  placeholder="Умови, побажання клієнта, примітки до замовлення…"
                />
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    loading={pending}
                    disabled={pending}
                    onClick={() => commit(editorRef.current?.getHtml() ?? "")}
                  >
                    Зберегти
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={cancel}>
                    Скасувати
                  </Button>
                </div>
              </>
            ) : empty ? (
              <p className="type-caption">Немає примітки до замовлення.</p>
            ) : (
              <MiniRichText value={comment} disabled />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
