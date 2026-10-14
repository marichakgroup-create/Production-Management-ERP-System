import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, className, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: cn("shrink-0", className),
    "aria-hidden": true as const,
    ...props,
  };
}

/* Navigation / domain */

export function IconOverview(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h7v3M14 21h4" />
    </svg>
  );
}

export function IconOrders(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 6h12M8 12h12M8 18h8" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

export function IconClients(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c0-2.8 2.5-5 6-5s6 2.2 6 5" />
      <path d="M16 8a2.5 2.5 0 1 1 0 5" />
      <path d="M19 19c0-1.8-1.2-3.3-3-4" />
    </svg>
  );
}

export function IconProducts(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
      <path d="M12 12 4 7M12 12l8-5M12 12v9" />
    </svg>
  );
}

/** Apparel / garment silhouette for product empty states. */
export function IconGarment(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8.5 4.5 12 7l3.5-2.5L19 7l1.5 3.5L17 12v8.5H7V12L3.5 10.5 5 7l3.5-2.5Z" />
      <path d="M9.5 20.5v-5h5v5" />
    </svg>
  );
}

export function IconMaterials(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 8c0-1.5 3.5-3 8-3s8 1.5 8 3-3.5 3-8 3-8-1.5-8-3Z" />
      <path d="M4 8v8c0 1.5 3.5 3 8 3s8-1.5 8-3V8" />
      <path d="M4 12c0 1.5 3.5 3 8 3s8-1.5 8-3" />
    </svg>
  );
}

export function IconOperations(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </svg>
  );
}

export function IconDecoration(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 19 14 9l3 3L7 22H4v-3Z" />
      <path d="m14 9 2-5 3 1-2 5" />
      <path d="M5 14h4" />
    </svg>
  );
}

export function IconPricing(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v10M9.5 9.5c.5-1 1.5-1.5 2.5-1.5s2 .7 2 1.8c0 2.2-4 1.6-4 4 0 1 .9 1.7 2 1.7s1.8-.4 2.3-1.2" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19c0-3.2 2.9-5.5 7-5.5s7 2.3 7 5.5" />
    </svg>
  );
}

export function IconCompany(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20V8l8-4 8 4v12" />
      <path d="M9 20v-5h6v5" />
      <path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
    </svg>
  );
}

export function IconCalc(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 8h8M8 12h2M12 12h2M16 12h1M8 16h2M12 16h2M16 16h1" />
    </svg>
  );
}

export function IconVersions(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

export function IconFiles(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function IconQuote(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 3h9l4 4v14H6V3Z" />
      <path d="M15 3v4h4" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

export function IconSpec(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h5M8 13h8M8 17h6" />
      <path d="M16 7.5 17 8.5 19 6.5" />
    </svg>
  );
}

export function IconHandover(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 12h11" />
      <path d="m11 8 4 4-4 4" />
      <path d="M17 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2" />
    </svg>
  );
}

export function IconSizes(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="8" width="18" height="8" rx="2" />
      <path d="M7 8v3M11 8v4M15 8v3M19 8v4" />
    </svg>
  );
}

/* Actions / UI */

export function IconSearch(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconFilter(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20h4L20 8l-4-4L4 16v4Z" />
      <path d="m14 6 4 4" />
    </svg>
  );
}

export function IconArchive(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

export function IconPrint(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 9V3h10v6" />
      <rect x="3" y="9" width="18" height="7" rx="2" />
      <path d="M7 14h10v7H7z" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/** Thumbtack — pin / unpin table rows. */
export function IconPin(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11-2.26l.77-3.98A2 2 0 0 1 10.61 3h2.78a2 2 0 0 1 1.95 1.52l.77 3.98A2 2 0 0 1 15 10.76V13a3 3 0 1 1-6 0v-2.24Z" />
    </svg>
  );
}

/** Six-dot grip for drag-reorder handles — filled dots for contrast on light rows. */
export function IconGrip(props: IconProps) {
  const attrs = base(props);
  return (
    <svg {...attrs} fill="currentColor" stroke="none">
      <circle cx="9" cy="6.5" r="1.85" />
      <circle cx="15" cy="6.5" r="1.85" />
      <circle cx="9" cy="12" r="1.85" />
      <circle cx="15" cy="12" r="1.85" />
      <circle cx="9" cy="17.5" r="1.85" />
      <circle cx="15" cy="17.5" r="1.85" />
    </svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4 3.5 19h17L12 4Z" />
      <path d="M12 10v4M12 16.5h.01" />
    </svg>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 7 10 17l-5-5" />
    </svg>
  );
}

export function IconCheckCircle(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  );
}

export function IconCircle(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4.5" y="10" width="15" height="10" rx="2" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconArrowLeft(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

export function IconGuide(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 5.5h9.5a2 2 0 0 1 2 2V19a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 0 4 19V7a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M8 9h6.5M8 12.5h6.5M8 16h4" />
    </svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
      <path d="m15 16 4-4-4-4M9 12h10" />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/* Material form section markers */

/** Card / title block. */
export function IconFormTitle(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 6.5h14M5 12h10M5 17.5h8" />
    </svg>
  );
}

/** Type + unit classification. */
export function IconClassify(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h7v4H4V7ZM13 7h7v4h-7V7ZM4 13h7v4H4v-4ZM13 13h7v4h-7v-4Z" />
    </svg>
  );
}

/** Fabric kind / textile swatch. */
export function IconFabricKind(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 8.5c2.5-2 5-3 8-3s5.5 1 8 3" />
      <path d="M4 12.5c2.5-2 5-3 8-3s5.5 1 8 3" />
      <path d="M4 16.5c2.5-2 5-3 8-3s5.5 1 8 3" />
    </svg>
  );
}

/** Fiber composition mix. */
export function IconComposition(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17M12 12l7.4-4.2M12 12l7.4 4.2" />
    </svg>
  );
}

/** Physical params: density / width / meters. */
export function IconParams(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h16M4 12h16M4 17h10" />
      <path d="M7 5v4M12 10v4M17 15v4" />
    </svg>
  );
}

/** Purchase in kg / cargo / FX. */
export function IconPurchaseKg(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 10.5h10l-1.2 8H8.2L7 10.5Z" />
      <path d="M9.5 10.5V9a2.5 2.5 0 0 1 5 0v1.5" />
      <path d="M12 4.5v2" />
    </svg>
  );
}

/** Linear meter pricing. */
export function IconMeterPrice(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 8h16v8H4V8Z" />
      <path d="M8 8v8M12 8v8M16 8v8" />
      <path d="M4 12h16" />
    </svg>
  );
}

/** Free-text note. */
export function IconNote(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 4.5h9l3 3V19.5H6V4.5Z" />
      <path d="M15 4.5V8h3.5M9 12h6M9 15.5h4" />
    </svg>
  );
}

/** Dense table / list rows. */
export function IconRows(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

/** Card grid. */
export function IconGrid(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7" height="7" rx="1.25" />
      <rect x="14" y="3" width="7" height="7" rx="1.25" />
      <rect x="3" y="14" width="7" height="7" rx="1.25" />
      <rect x="14" y="14" width="7" height="7" rx="1.25" />
    </svg>
  );
}
