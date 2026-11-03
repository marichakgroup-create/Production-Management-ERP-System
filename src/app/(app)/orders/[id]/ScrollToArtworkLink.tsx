"use client";

import type { ReactNode } from "react";
import Link from "next/link";

/** Sticky top bar is 56px. Sit the artwork header just under it. */
const ARTWORK_TOP = 68;

export function focusArtwork() {
  let stopped = false;
  let stable = 0;
  const started = performance.now();
  const tick = () => {
    if (stopped) return;
    const node = document.getElementById("order-artwork");
    if (!node) {
      if (performance.now() - started < 8000) requestAnimationFrame(tick);
      return;
    }
    const delta = node.getBoundingClientRect().top - ARTWORK_TOP;
    if (Math.abs(delta) > 6) {
      stable = 0;
      window.scrollBy({ top: delta, behavior: "auto" });
    } else {
      stable += 1;
    }
    // Layout below the header (tables, previews) can push the block down
    // after the first scroll. Keep correcting until it stays put.
    if (stable < 8 && performance.now() - started < 2500) {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
  return () => {
    stopped = true;
  };
}

function withArtworkFocus(href: string) {
  const [path, query = ""] = href.split("#")[0]!.split("?");
  const params = new URLSearchParams(query);
  params.set("focus", "artwork");
  return `${path}?${params.toString()}`;
}

export function ScrollToArtworkLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={withArtworkFocus(href)}
      scroll={false}
      className={className}
      onClick={(event) => {
        if (!document.getElementById("order-artwork")) return;
        event.preventDefault();
        focusArtwork();
      }}
    >
      {children}
    </Link>
  );
}
