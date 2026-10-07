"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { StatusBadge } from "@/components/ui/Page";
import { IconPlus, IconTrash } from "@/components/ui/Icons";
import { controlClass } from "@/components/ui/Field";
import {
  Table,
  TableCard,
  TableToolbar,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/Table";
import { cn, formatDateUk } from "@/lib/utils";
import { ProductThumb } from "@/components/orders/ProductCatalogPanel";
import {
  deleteOrderFileAction,
  updateOrderFileMetaAction,
  uploadOrderFileAction,
} from "@/server/domains/orders/actions";
import {
  itemNeedsArtworkFile,
  ORDER_FILE_ACCEPT,
  ORDER_FILE_MAX_COUNT,
  ORDER_FILE_MAX_MB,
  orderArtworkReady,
} from "@/lib/order-files";

export type OrderFileRow = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
  caption?: string | null;
  orderItemId?: string | null;
  orderItemNameUk?: string | null;
  orderItemImageUrl?: string | null;
};

export type OrderArtworkItem = {
  id: string;
  nameUk: string;
  imageUrl?: string | null;
  decorationsCount: number;
  decorationNames: string[];
};

const selectClass = cn(controlClass, "h-8 min-w-0 px-2 text-[13px]");
const inputClass = cn(controlClass, "h-8 min-w-0 px-2 text-[13px]");

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function uploadErrorMessage(error: string | undefined, message?: string) {
  switch (error) {
    case "TOO_LARGE":
      return `Файл більший за ${ORDER_FILE_MAX_MB} МБ.`;
    case "TOO_MANY":
      return `У замовленні вже ${ORDER_FILE_MAX_COUNT} файлів.`;
    case "TYPE":
      return "Підходять PDF, зображення, AI/EPS або ZIP.";
    case "ITEM":
      return "Обрана позиція не знайдена.";
    case "ORDER_LOCKED":
      return "До цього замовлення файли вже не додаються.";
    case "UPLOAD":
      return message?.trim() || "Не вдалося зберегти файл у сховищі.";
    default:
      return "Не вдалося завантажити файл.";
  }
}

function hasFileDrag(event: React.DragEvent) {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function ProductSelect({
  items,
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  items: OrderArtworkItem[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const selected = items.find((item) => item.id === value);
  const label = selected?.nameUk ?? "Без виробу";

  return (
    <div className="flex min-w-0 items-center gap-2">
      <ProductThumb
        imageUrl={selected?.imageUrl}
        label={label}
        size="sm"
      />
      {items.length > 0 ? (
        <select
          value={value}
          disabled={disabled}
          aria-label={ariaLabel ?? "Виріб"}
          onChange={(event) => onChange(event.target.value)}
          className={cn(selectClass, "flex-1")}
        >
          <option value="">Без виробу</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nameUk}
            </option>
          ))}
        </select>
      ) : (
        <span className="truncate text-[13px] text-[var(--color-text-tertiary)]">
          Без виробу
        </span>
      )}
    </div>
  );
}

export function OrderAttachments({
  orderId,
  files,
  artworkItems = [],
  locked,
}: {
  orderId: string;
  files: OrderFileRow[];
  artworkItems?: OrderArtworkItem[];
  locked?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [linkItemId, setLinkItemId] = useState(() =>
    artworkItems.length === 1 ? artworkItems[0]!.id : "",
  );
  const [caption, setCaption] = useState("");

  const decorated = useMemo(
    () => artworkItems.filter((item) => item.decorationsCount > 0),
    [artworkItems],
  );

  const artworkReady = orderArtworkReady(
    decorated.map((item) => ({ id: item.id, decorationsCount: item.decorationsCount })),
    files,
  );
  const missingArtwork = decorated.filter((item) =>
    itemNeedsArtworkFile(
      { id: item.id, decorationsCount: item.decorationsCount },
      files,
    ),
  );
  const atLimit = files.length >= ORDER_FILE_MAX_COUNT;
  const canUpload = !locked && !atLimit;

  function uploadFiles(fileList: FileList | File[] | null) {
    const selected = fileList ? Array.from(fileList) : [];
    if (selected.length === 0) return;
    setError(null);
    startTransition(async () => {
      let remaining = ORDER_FILE_MAX_COUNT - files.length;
      for (const file of selected) {
        if (remaining <= 0) {
          setError(uploadErrorMessage("TOO_MANY"));
          break;
        }
        const formData = new FormData();
        formData.set("orderId", orderId);
        formData.set("file", file);
        if (linkItemId) formData.set("orderItemId", linkItemId);
        if (caption.trim()) formData.set("caption", caption.trim());
        const result = await uploadOrderFileAction(formData);
        if (!result.ok) {
          setError(
            uploadErrorMessage(
              result.error,
              "message" in result ? String(result.message ?? "") : undefined,
            ),
          );
          break;
        }
        remaining -= 1;
      }
      if (inputRef.current) inputRef.current.value = "";
      setCaption("");
      router.refresh();
    });
  }

  function remove(fileId: string) {
    if (!window.confirm("Прибрати цей файл?")) return;
    setError(null);
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("fileId", fileId);
    startTransition(async () => {
      const result = await deleteOrderFileAction(formData);
      if (!result.ok) {
        setError(
          result.error === "ORDER_LOCKED"
            ? "Після передачі в цех файли не видаляються."
            : "Не вдалося видалити файл.",
        );
        return;
      }
      router.refresh();
    });
  }

  function saveMeta(fileId: string, next: { caption?: string; orderItemId?: string }) {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("fileId", fileId);
    if (next.caption !== undefined) formData.set("caption", next.caption);
    if (next.orderItemId !== undefined) formData.set("orderItemId", next.orderItemId);
    startTransition(async () => {
      const result = await updateOrderFileMetaAction(formData);
      if (!result.ok) {
        setError("Не вдалося оновити файл.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <TableCard>
      <TableToolbar
        left={
          <div className="min-w-0">
            <p className="type-subsection">Вкладення</p>
            <p className="type-caption mt-0.5">
              До {ORDER_FILE_MAX_MB} МБ · до {ORDER_FILE_MAX_COUNT} файлів
            </p>
          </div>
        }
        right={
          <>
            {decorated.length > 0 ? (
              <StatusBadge tone={artworkReady ? "success" : "warning"}>
                {artworkReady ? "Макети є" : `Потрібен макет · ${missingArtwork.length}`}
              </StatusBadge>
            ) : null}
            <span className="type-caption tabular">
              {files.length}/{ORDER_FILE_MAX_COUNT}
            </span>
          </>
        }
      />

      {error ? (
        <div className="border-b border-[var(--color-divider)] px-3.5 py-2.5">
          <Banner tone="danger">{error}</Banner>
        </div>
      ) : null}

      {files.length > 0 ? (
        <Table>
          <THead>
            <TH>Виріб</TH>
            <TH>Файл</TH>
            <TH>Підпис</TH>
            {!locked ? <TH width="44px" /> : null}
          </THead>
          <TBody>
            {files.map((file) => (
              <FileRow
                key={`${file.id}:${file.caption ?? ""}:${file.orderItemId ?? ""}`}
                file={file}
                items={artworkItems}
                locked={locked}
                pending={pending}
                onRemove={() => remove(file.id)}
                onCaption={(value) => saveMeta(file.id, { caption: value })}
                onLinkItem={(value) => saveMeta(file.id, { orderItemId: value })}
              />
            ))}
          </TBody>
        </Table>
      ) : (
        <p className="px-3.5 py-5 text-center type-caption">Файлів ще немає</p>
      )}

      {canUpload ? (
        <div
          className={cn(
            "border-t border-dashed px-3.5 py-3 transition-colors",
            dragging
              ? "border-[var(--color-primary-600)] bg-[var(--color-primary-50)]"
              : "border-[var(--color-border)] bg-[var(--color-surface-subtle)]",
          )}
          onDragEnter={(event) => {
            if (!hasFileDrag(event)) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => {
            if (!hasFileDrag(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            const next = event.relatedTarget as Node | null;
            if (next && event.currentTarget.contains(next)) return;
            setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            uploadFiles(event.dataTransfer.files);
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[12rem] flex-1 basis-[12rem]">
              <ProductSelect
                items={artworkItems}
                value={linkItemId}
                onChange={setLinkItemId}
                disabled={pending}
              />
            </div>
            <input
              value={caption}
              disabled={pending}
              placeholder="Підпис"
              className={cn(inputClass, "min-w-[8rem] flex-1 basis-[8rem]")}
              onChange={(event) => setCaption(event.target.value)}
            />
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              accept={ORDER_FILE_ACCEPT}
              multiple
              onChange={(event) => uploadFiles(event.target.files)}
            />
            <Button
              type="button"
              size="sm"
              loading={pending}
              disabled={pending}
              onClick={() => inputRef.current?.click()}
            >
              <IconPlus size={14} />
              {pending ? "Завантаження…" : "Додати файл"}
            </Button>
            <span className="type-caption whitespace-nowrap text-[var(--color-text-tertiary)]">
              {dragging ? "Відпустіть файли" : "або перетягніть сюди"}
            </span>
          </div>
        </div>
      ) : null}
    </TableCard>
  );
}

function FileRow({
  file,
  items,
  locked,
  pending,
  onRemove,
  onCaption,
  onLinkItem,
}: {
  file: OrderFileRow;
  items: OrderArtworkItem[];
  locked?: boolean;
  pending: boolean;
  onRemove: () => void;
  onCaption: (value: string) => void;
  onLinkItem: (value: string) => void;
}) {
  const [captionDraft, setCaptionDraft] = useState(file.caption ?? "");
  const linked = items.find((item) => item.id === file.orderItemId);
  const productName = linked?.nameUk ?? file.orderItemNameUk;
  const productImage = linked?.imageUrl ?? file.orderItemImageUrl;

  return (
    <TR>
      <TD>
        {locked || items.length === 0 ? (
          <div className="flex min-w-0 items-center gap-2">
            <ProductThumb
              imageUrl={productImage}
              label={productName ?? "Без виробу"}
              size="sm"
            />
            <span
              className={cn(
                "min-w-0 truncate text-[13px]",
                productName
                  ? "font-medium text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-tertiary)]",
              )}
            >
              {productName ?? "Без виробу"}
            </span>
          </div>
        ) : (
          <ProductSelect
            items={items}
            value={file.orderItemId ?? ""}
            onChange={onLinkItem}
            disabled={pending}
            ariaLabel="Привʼязати до виробу"
          />
        )}
      </TD>
      <TD>
        <div className="min-w-0">
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate font-medium text-[var(--color-text-primary)] hover:text-[var(--color-primary-700)] hover:underline"
          >
            {file.fileName}
          </a>
          <p className="type-caption tabular">
            {formatBytes(file.sizeBytes)} · {formatDateUk(file.createdAt)}
          </p>
        </div>
      </TD>
      <TD>
        {locked ? (
          <span className="type-caption text-[var(--color-text-secondary)]">
            {file.caption || "—"}
          </span>
        ) : (
          <input
            value={captionDraft}
            disabled={pending}
            placeholder="Підпис"
            className={inputClass}
            onChange={(event) => setCaptionDraft(event.target.value)}
            onBlur={() => {
              if ((file.caption ?? "") !== captionDraft.trim()) {
                onCaption(captionDraft.trim());
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        )}
      </TD>
      {locked ? null : (
        <TD>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            aria-label={`Видалити ${file.fileName}`}
            onClick={onRemove}
          >
            <IconTrash size={14} />
          </Button>
        </TD>
      )}
    </TR>
  );
}
