"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { IconClose, IconProducts } from "@/components/ui/Icons";
import { PRODUCT_IMAGE_MAX_MB } from "@/lib/product-image";
import { cn } from "@/lib/utils";
import {
  updateProductImageAction,
  uploadProductImageAction,
} from "@/server/domains/products/actions";

export function ProductImagePicker({
  productId,
  imageUrl: initialImageUrl,
  disabled = false,
  className,
}: {
  productId: string;
  imageUrl: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialImageUrl);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setImageUrl(initialImageUrl);
    setPreviewUrl(initialImageUrl);
  }, [initialImageUrl]);

  const busy = uploading || pending;
  const display = previewUrl || imageUrl;

  async function persistUrl(url: string | null) {
    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("imageUrl", url ?? "");
    const result = await updateProductImageAction(formData);
    if (!result.ok) {
      setError(
        result.error === "VALIDATION"
          ? "Некоректне посилання на фото."
          : "Не вдалося зберегти фото.",
      );
      setPreviewUrl(imageUrl);
      return false;
    }
    setImageUrl(result.imageUrl);
    setPreviewUrl(result.imageUrl);
    router.refresh();
    return true;
  }

  async function onPickFile(file: File | null) {
    if (!file || disabled) return;
    setError(null);
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    try {
      const data = new FormData();
      data.set("file", file);
      const uploaded = await uploadProductImageAction(data);
      if (!uploaded.ok || !("url" in uploaded) || !uploaded.url) {
        URL.revokeObjectURL(localPreview);
        setPreviewUrl(imageUrl);
        setError(
          uploaded.error === "TOO_LARGE"
            ? `Фото до ${PRODUCT_IMAGE_MAX_MB} МБ.`
            : uploaded.error === "TYPE"
              ? "Потрібен файл зображення."
              : uploaded.error === "EMPTY"
                ? "Оберіть файл зображення."
                : "message" in uploaded && uploaded.message
                  ? `Не вдалося завантажити: ${uploaded.message}`
                  : "Не вдалося завантажити.",
        );
        return;
      }
      startTransition(async () => {
        const saved = await persistUrl(uploaded.url);
        URL.revokeObjectURL(localPreview);
        if (!saved) setPreviewUrl(imageUrl);
      });
    } finally {
      setUploading(false);
    }
  }

  function removeImage() {
    if (disabled || busy) return;
    setError(null);
    setPreviewUrl(null);
    startTransition(async () => {
      const saved = await persistUrl(null);
      if (!saved) setPreviewUrl(imageUrl);
    });
  }

  return (
    <div className={cn("shrink-0", className)}>
      <div className="group relative h-28 w-28">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "relative flex h-full w-full items-center justify-center overflow-hidden rounded-[var(--radius-surface)] border bg-[var(--color-tint-slate)] transition-colors",
            display
              ? "border-[var(--color-border)]"
              : "border-dashed border-[var(--color-border-strong)] hover:border-[var(--color-primary-400)] hover:bg-[var(--color-surface-hover)]",
            !disabled && !busy && "cursor-pointer",
            (disabled || busy) && "cursor-default opacity-80",
          )}
          aria-label={display ? "Змінити фото виробу" : "Додати фото виробу"}
        >
          {display ? (
            <Image
              src={display}
              alt=""
              fill
              sizes="112px"
              className="object-cover"
              unoptimized={
                display.startsWith("blob:") ||
                display.startsWith("/uploads/") ||
                display.includes("supabase.co")
              }
              onError={() => {
                // Stale local /uploads URL or deleted Storage object.
                if (!display.startsWith("blob:")) {
                  setError("Фото недоступне — завантажте знову.");
                  setPreviewUrl(null);
                  setImageUrl(null);
                }
              }}
            />
          ) : (
            <span className="flex flex-col items-center gap-1 px-2 text-center text-[var(--color-text-tertiary)]">
              <IconProducts size={22} />
              <span className="text-[10px] font-medium leading-tight">
                {busy ? "Збереження…" : "Додати фото"}
              </span>
            </span>
          )}
          {display && !disabled ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
              {busy ? "…" : "Змінити"}
            </span>
          ) : null}
        </button>

        {display && !disabled ? (
          <button
            type="button"
            aria-label="Прибрати фото"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              removeImage();
            }}
            className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-tertiary)] shadow-sm transition-colors hover:text-[var(--color-danger-text)] disabled:opacity-50"
          >
            <IconClose size={12} />
          </button>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={disabled || busy}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            void onPickFile(file);
            event.target.value = "";
          }}
        />
      </div>
      {error ? <p className="mt-1 max-w-28 text-[11px] text-[var(--color-danger-text)]">{error}</p> : null}
    </div>
  );
}
