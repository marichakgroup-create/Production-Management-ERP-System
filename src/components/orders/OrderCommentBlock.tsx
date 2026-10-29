"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MiniRichText } from "@/components/ui/MiniRichText";
import { updateOrderCommentAction } from "@/server/domains/orders/actions";
import { richTextIsEmpty, sanitizeRichHtml } from "@/lib/rich-text";

function previewText(html: string | null | undefined): string {
  const plain = sanitizeRichHtml(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "—";
  return plain.length > 90 ? `${plain.slice(0, 90)}…` : plain;
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
  const [pending, startTransition] = useTransition();
  const empty = richTextIsEmpty(comment);
  const preview = useMemo(() => previewText(comment), [comment]);

  function save(next: string) {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("comment", next);
    startTransition(async () => {
      await updateOrderCommentAction(formData);
      router.refresh();
    });
  }

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-baseline gap-2 marker:content-none [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="mt-0.5 inline-block text-[11px] text-[var(--color-text-tertiary)] transition-transform group-open:rotate-90"
        >
          ▶
        </span>
        <span className="type-caption min-w-0 flex-1">
          <span className="text-[var(--color-text-tertiary)]">Коментар: </span>
          <span className="text-[var(--color-text-secondary)]">{preview}</span>
        </span>
        {!locked ? (
          <span className="shrink-0 text-[12.5px] font-medium text-[var(--color-primary-700)]">
            {empty ? "Додати" : "Змінити"}
          </span>
        ) : null}
      </summary>
      <div className="mt-2 pl-5">
        <MiniRichText
          value={comment}
          disabled={locked || pending}
          placeholder="Умови, побажання клієнта, примітки до замовлення…"
          onChange={save}
        />
      </div>
    </details>
  );
}
