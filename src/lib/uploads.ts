import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ORDER_FILE_MAX_BYTES } from "@/lib/order-files";
import { UPLOADS_BUCKET } from "@/lib/supabase/client";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp", "heic", "heif"]);
const SUPABASE_UPLOAD_TIMEOUT_MS = 20_000;

export function isImageUpload(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXT.has(ext);
}

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName) return fromName;
  const fromType = file.type.split("/")[1]?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return fromType || "jpg";
}

function allowLocalUploads(): boolean {
  if (process.env.ALLOW_LOCAL_UPLOADS === "1") return true;
  // Never write to the container FS in production — files vanish on redeploy.
  if (process.env.NODE_ENV === "production") return false;
  // Dev: local disk when Storage cannot upload (no service role / no URL).
  return !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

async function uploadToLocal(folder: string, file: File, buffer: Buffer): Promise<string> {
  const ext = extensionFor(file);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const relativeDir = path.join("uploads", folder);
  const absoluteDir = path.join(process.cwd(), "public", relativeDir);
  await mkdir(absoluteDir, { recursive: true });
  await writeFile(path.join(absoluteDir, fileName), buffer);
  return `/${relativeDir.replaceAll("\\", "/")}/${fileName}`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Extract storage object key from a public Supabase URL, if it belongs to our uploads bucket. */
export function supabaseStorageKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${UPLOADS_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  try {
    return decodeURIComponent(url.slice(idx + marker.length).split("?")[0] ?? "");
  } catch {
    return url.slice(idx + marker.length).split("?")[0] ?? null;
  }
}

function localUploadPathFromUrl(url: string | null | undefined): string | null {
  if (!url?.startsWith("/uploads/")) return null;
  if (url.includes("..")) return null;
  return path.join(process.cwd(), "public", url.replace(/^\//, ""));
}

async function ensureUploadsBucket(): Promise<void> {
  const { getSupabaseAdmin } = await import("@/lib/supabase/client");
  const supabase = getSupabaseAdmin();
  const listed = await supabase.storage.listBuckets();
  if (listed.error) {
    console.warn("[upload] listBuckets:", listed.error.message);
    return;
  }
  const exists = listed.data?.some((bucket) => bucket.name === UPLOADS_BUCKET);
  // Shared bucket for product images + order docs (PDF/AI/ZIP up to 50 MB).
  const options = {
    public: true,
    fileSizeLimit: ORDER_FILE_MAX_BYTES,
    // No mime whitelist — order artwork is often PDF / AI / EPS / ZIP.
  } as const;
  if (!exists) {
    const created = await supabase.storage.createBucket(UPLOADS_BUCKET, options);
    if (created.error && !/already exists/i.test(created.error.message)) {
      console.warn("[upload] createBucket:", created.error.message);
    }
    return;
  }
  const updated = await supabase.storage.updateBucket(UPLOADS_BUCKET, options);
  if (updated.error) {
    console.warn("[upload] updateBucket:", updated.error.message);
  }
}

async function uploadToSupabase(
  storageKey: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY не налаштовано — без нього фото не збережуться на проді",
    );
  }

  const { getSupabaseAdmin } = await import("@/lib/supabase/client");
  const supabase = getSupabaseAdmin();
  await ensureUploadsBucket();

  const uploadResult = await withTimeout(
    supabase.storage.from(UPLOADS_BUCKET).upload(storageKey, buffer, {
      contentType,
      upsert: true,
      cacheControl: "3600",
    }),
    SUPABASE_UPLOAD_TIMEOUT_MS,
    "Supabase upload",
  );
  if (uploadResult.error) {
    throw new Error(uploadResult.error.message);
  }
  const { data } = supabase.storage.from(UPLOADS_BUCKET).getPublicUrl(storageKey);
  if (!data.publicUrl) throw new Error("Не отримано public URL від Storage");
  return data.publicUrl;
}

/**
 * Delete a previously stored product image (Supabase object or local /uploads file).
 * Best-effort — never throws to the caller.
 */
export async function removeStoredProductImage(url: string | null | undefined): Promise<void> {
  if (!url) return;

  const storageKey = supabaseStorageKeyFromUrl(url);
  if (storageKey && supabaseConfigured()) {
    try {
      const { getSupabaseAdmin } = await import("@/lib/supabase/client");
      const supabase = getSupabaseAdmin();
      await supabase.storage.from(UPLOADS_BUCKET).remove([storageKey]);
    } catch (error) {
      console.warn(
        "[upload] remove supabase object failed:",
        error instanceof Error ? error.message : error,
      );
    }
    return;
  }

  const localPath = localUploadPathFromUrl(url);
  if (localPath) {
    try {
      await unlink(localPath);
    } catch {
      // missing file is fine
    }
  }
}

/**
 * Store an image for product cards / create flow.
 * Production / shared DB: Supabase Storage (durable public URL).
 * Pure local without Supabase: public/uploads (dev only).
 */
export async function storeProductImage(file: File): Promise<
  { ok: true; url: string } | { ok: false; error: "UPLOAD"; message: string }
> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = extensionFor(file);
  const storageKey = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const contentType = file.type.startsWith("image/")
    ? file.type
    : `image/${ext === "jpg" ? "jpeg" : ext}`;

  if (supabaseConfigured() || process.env.NODE_ENV === "production") {
    try {
      const remoteUrl = await uploadToSupabase(storageKey, buffer, contentType);
      return { ok: true, url: remoteUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Supabase upload failed";
      console.error("[upload] product image failed:", message);
      return { ok: false, error: "UPLOAD", message };
    }
  }

  if (!allowLocalUploads()) {
    return {
      ok: false,
      error: "UPLOAD",
      message:
        "Завантаження фото недоступне: налаштуйте NEXT_PUBLIC_SUPABASE_URL і SUPABASE_SERVICE_ROLE_KEY",
    };
  }

  try {
    const url = await uploadToLocal("products", file, buffer);
    return { ok: true, url };
  } catch (error) {
    return {
      ok: false,
      error: "UPLOAD",
      message: error instanceof Error ? error.message : "Local upload failed",
    };
  }
}

/**
 * Store an order attachment. Returns a storageKey for FileAsset
 * (Supabase object key, or /uploads/... path for local dev).
 */
export async function storeOrderFile(
  orderId: string,
  file: File,
): Promise<
  { ok: true; storageKey: string } | { ok: false; error: "UPLOAD"; message: string }
> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = extensionFor(file);
  const safe = file.name.replace(/[^\w.\-а-яА-ЯіІїЇєЄёЁ ]+/g, "_").slice(0, 80);
  const objectKey = `orders/${orderId}/${Date.now()}-${safe || `file.${ext}`}`;
  const contentType = file.type || "application/octet-stream";

  const canUseSupabase =
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) && supabaseConfigured();

  if (canUseSupabase) {
    try {
      await uploadToSupabase(objectKey, buffer, contentType);
      return { ok: true, storageKey: objectKey };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Supabase upload failed";
      console.error("[upload] order file failed:", message);
      if (!allowLocalUploads()) {
        return { ok: false, error: "UPLOAD", message };
      }
      // Fall through to local in pure local/dev.
    }
  }

  if (!allowLocalUploads()) {
    return {
      ok: false,
      error: "UPLOAD",
      message:
        "Сховище недоступне: додайте SUPABASE_SERVICE_ROLE_KEY або ALLOW_LOCAL_UPLOADS=1 для локальної розробки",
    };
  }

  try {
    const url = await uploadToLocal(`orders/${orderId}`, file, buffer);
    return { ok: true, storageKey: url };
  } catch (error) {
    return {
      ok: false,
      error: "UPLOAD",
      message: error instanceof Error ? error.message : "Local upload failed",
    };
  }
}

/** Best-effort remove of an order attachment (Supabase key or /uploads path). */
export async function removeStoredOrderFile(storageKey: string | null | undefined): Promise<void> {
  if (!storageKey) return;

  if (storageKey.startsWith("/uploads/") || storageKey.startsWith("uploads/")) {
    const localPath = localUploadPathFromUrl(
      storageKey.startsWith("/") ? storageKey : `/${storageKey}`,
    );
    if (localPath) {
      try {
        await unlink(localPath);
      } catch {
        // missing file is fine
      }
    }
    return;
  }

  if (!supabaseConfigured()) return;
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client");
    const supabase = getSupabaseAdmin();
    await supabase.storage.from(UPLOADS_BUCKET).remove([storageKey]);
  } catch (error) {
    console.warn(
      "[upload] remove order file failed:",
      error instanceof Error ? error.message : error,
    );
  }
}
