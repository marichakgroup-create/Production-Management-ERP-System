import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

function supabaseHostname(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

const supabaseHost = supabaseHostname();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Every file upload is a Server Action: order artwork/docs (up to 50 MB)
    // and product photos (up to 15 MB). The framework default is 1 MB and
    // returns 500 before the action's own size check. Auth middleware also
    // buffers the body and defaults to 10 MB, which would still reject
    // larger documents. Leave room for the multipart envelope.
    serverActions: {
      bodySizeLimit: "55mb",
    },
    proxyClientMaxBodySize: "55mb",
  },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Prisma must not be bundled by Turbopack/webpack — otherwise the generated
  // client can lose model delegates (e.g. fixedCostArticle) at runtime, and
  // webpack may spend 1–2 minutes compiling the ~5MB WASM base64 payload.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    ".prisma/client",
    "prisma",
    "pg",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      ...(supabaseHost
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHost,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
    ],
  },
};

export default withNextIntl(nextConfig);
