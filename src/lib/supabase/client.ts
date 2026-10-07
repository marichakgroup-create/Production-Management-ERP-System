import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const UPLOADS_BUCKET = "uploads";

/**
 * Server-side Supabase client.
 * Prefer service role for Storage uploads (bypasses bucket RLS).
 * Falls back to anon key when service role is not configured.
 */
export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;

  if (!url || !key) {
    throw new Error("Supabase URL or key is not configured");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function publicUploadUrl(storageKey: string) {
  // Local /uploads/... keys are served from public/ — no Supabase needed.
  if (storageKey.startsWith("/uploads/") || storageKey.startsWith("uploads/")) {
    return storageKey.startsWith("/") ? storageKey : `/${storageKey}`;
  }
  const supabase = getSupabaseAdmin();
  return supabase.storage.from(UPLOADS_BUCKET).getPublicUrl(storageKey).data.publicUrl;
}
