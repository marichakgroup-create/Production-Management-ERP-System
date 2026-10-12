"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/layout/SidebarContext";
import {
  IconCalc,
  IconChevronLeft,
  IconChevronRight,
  IconClients,
  IconCompany,
  IconDecoration,
  IconGuide,
  IconMaterials,
  IconOperations,
  IconOrders,
  IconOverview,
  IconPlus,
  IconPricing,
  IconProducts,
  IconSizes,
  IconUsers,
} from "@/components/ui/Icons";
import type { Permission } from "@/lib/permissions";

type NavItem = {
  href: string;
  labelKey:
    | "overview"
    | "orders"
    | "clients"
    | "products"
    | "materials"
    | "operations"
    | "decorations"
    | "sizeCharts"
    | "fixedCosts"
    | "pricing"
    | "users"
    | "company"
    | "guide";
  icon: React.ComponentType<{ size?: number; className?: string }>;
  requiredPermission?: Permission;
};

const workspace: NavItem[] = [
  { href: "/overview", labelKey: "overview", icon: IconOverview },
  { href: "/orders", labelKey: "orders", icon: IconOrders },
  { href: "/clients", labelKey: "clients", icon: IconClients },
  { href: "/products", labelKey: "products", icon: IconProducts },
  { href: "/guide", labelKey: "guide", icon: IconGuide },
];

const catalogs: NavItem[] = [
  {
    href: "/settings/resources",
    labelKey: "materials",
    icon: IconMaterials,
    requiredPermission: "manageCatalogs",
  },
  {
    href: "/settings/operations",
    labelKey: "operations",
    icon: IconOperations,
    requiredPermission: "manageCatalogs",
  },
  {
    href: "/settings/size-charts",
    labelKey: "sizeCharts",
    icon: IconSizes,
    requiredPermission: "manageCatalogs",
  },
  {
    href: "/settings/applications",
    labelKey: "decorations",
    icon: IconDecoration,
    requiredPermission: "manageCatalogs",
  },
  {
    href: "/settings/fixed-costs",
    labelKey: "fixedCosts",
    icon: IconCalc,
    requiredPermission: "manageCatalogs",
  },
];

const configuration: NavItem[] = [
  { href: "/settings/pricing", labelKey: "pricing", icon: IconPricing, requiredPermission: "managePricingRules" },
  { href: "/settings/users", labelKey: "users", icon: IconUsers, requiredPermission: "manageUsers" },
  { href: "/settings/company", labelKey: "company", icon: IconCompany, requiredPermission: "managePricingRules" },
];

function NavLink({
  item,
  label,
  collapsed,
}: {
  item: NavItem;
  label: string;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center rounded-[8px] text-[13.5px] font-medium transition-colors duration-150",
        collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2",
        active
          ? "bg-[var(--color-sidebar-active)] text-[var(--color-sidebar-active-text)]"
          : "text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover)] hover:text-[var(--color-sidebar-active-text)]",
      )}
    >
      {active ? (
        <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-[var(--color-sidebar-accent)]" />
      ) : null}
      <Icon
        size={18}
        className={active ? "text-[var(--color-sidebar-accent)]" : "text-[var(--color-sidebar-text-muted)]"}
      />
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </Link>
  );
}

function NavGroup({
  title,
  items,
  t,
  collapsed,
  permissions,
}: {
  title: string;
  items: NavItem[];
  t: (key: string) => string;
  collapsed: boolean;
  permissions: Permission[];
}) {
  const visible = items.filter(
    (item) => !item.requiredPermission || permissions.includes(item.requiredPermission),
  );
  if (visible.length === 0) return null;

  return (
    <div>
      {!collapsed ? (
        <div className="mb-1.5 px-3 text-[10.5px] font-bold tracking-[0.1em] text-[var(--color-sidebar-text-muted)] uppercase">
          {title}
        </div>
      ) : (
        <div className="mx-auto mb-1 h-px w-6 bg-[var(--color-sidebar-border)]" aria-hidden />
      )}
      <div className="flex flex-col gap-0.5">
        {visible.map((item) => (
          <NavLink key={item.href} item={item} label={t(item.labelKey)} collapsed={collapsed} />
        ))}
      </div>
    </div>
  );
}

export function AppSidebar({ permissions = [] }: { permissions?: Permission[] }) {
  const t = useTranslations("nav");
  const {
    collapsed,
    railCollapsed,
    overlayOpen,
    toggle,
    setPreferredCollapsed,
    expandDespiteOverlay,
    collapseDuringOverlay,
    beginHoverPeek,
    endHoverPeek,
  } = useSidebar();

  const peeking = railCollapsed && !collapsed;

  return (
    <>
      {railCollapsed ? (
        <div className="w-[var(--sidebar-width)] shrink-0" aria-hidden />
      ) : null}
      <aside
        onMouseEnter={() => {
          if (railCollapsed) beginHoverPeek();
        }}
        onMouseLeave={() => endHoverPeek()}
        className={cn(
          "flex h-screen shrink-0 flex-col bg-[var(--color-sidebar-bg)] text-[var(--color-sidebar-text)] transition-[width,box-shadow] duration-200 ease-out",
          peeking
            ? "fixed top-0 left-0 z-[55] w-[232px] shadow-[var(--shadow-panel)]"
            : railCollapsed
              ? "fixed top-0 left-0 z-40 w-[var(--sidebar-width)]"
              : "sticky top-0 z-40 w-[var(--sidebar-width)]",
        )}
      >
      <div
        className={cn(
          "flex h-14 items-center border-b border-[var(--color-sidebar-border)]",
          collapsed ? "justify-center px-1" : "gap-2.5 px-4",
        )}
      >
        <button
          type="button"
          onClick={() => {
            if (collapsed) {
              if (overlayOpen) expandDespiteOverlay();
              else setPreferredCollapsed(false);
            }
          }}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[var(--color-sidebar-accent)] text-[13px] font-semibold text-[var(--color-on-primary)]",
            collapsed && "cursor-pointer hover:brightness-110",
          )}
          title={collapsed ? "Розгорнути меню" : "Виробництво"}
          aria-label={collapsed ? "Розгорнути меню" : "Виробництво"}
        >
          В
        </button>
        {!collapsed ? (
          <div className="min-w-0">
            <div
              className="truncate text-[14px] font-semibold tracking-tight text-[var(--color-sidebar-active-text)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Виробництво
            </div>
            <div className="truncate text-[11.5px] text-[var(--color-sidebar-text-muted)]">
              Замовлення та ціни
            </div>
          </div>
        ) : null}
      </div>

      <div className={cn("pt-3", collapsed ? "px-1.5" : "px-3")}>
        <Link
          href="/orders/new"
          title={t("newOrder")}
          aria-label={t("newOrder")}
          className={cn(
            "flex h-9 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-sidebar-accent)] font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[#36b882]",
            collapsed ? "px-0" : "gap-1.5 text-[13.5px]",
          )}
        >
          <IconPlus size={16} />
          {!collapsed ? t("newOrder") : null}
        </Link>
      </div>

      <nav
        className={cn(
          "flex flex-1 flex-col gap-5 overflow-y-auto py-4",
          collapsed ? "px-1.5" : "px-2",
        )}
      >
        <NavGroup
          title={t("operational")}
          items={workspace}
          t={t}
          collapsed={collapsed}
          permissions={permissions}
        />
        <NavGroup
          title={t("catalogsGroup")}
          items={catalogs}
          t={t}
          collapsed={collapsed}
          permissions={permissions}
        />
        <NavGroup
          title={t("settingsGroup")}
          items={configuration}
          t={t}
          collapsed={collapsed}
          permissions={permissions}
        />
      </nav>

      <div className="border-t border-[var(--color-sidebar-border)] p-1.5">
        <button
          type="button"
          onClick={() => {
            if (overlayOpen && collapsed) {
              expandDespiteOverlay();
              return;
            }
            if (overlayOpen && !collapsed) {
              collapseDuringOverlay();
              return;
            }
            toggle();
          }}
          title={collapsed ? "Розгорнути меню" : "Згорнути меню"}
          aria-label={collapsed ? "Розгорнути меню" : "Згорнути меню"}
          aria-expanded={!collapsed}
          className={cn(
            "flex w-full items-center rounded-[8px] py-2 text-[12.5px] font-medium transition-colors hover:bg-[var(--color-sidebar-hover)] hover:text-[var(--color-sidebar-active-text)]",
            collapsed ? "justify-center" : "gap-2 px-3",
            overlayOpen && collapsed
              ? "bg-[var(--color-sidebar-hover)] text-[var(--color-sidebar-active-text)] ring-1 ring-[var(--color-sidebar-accent)]/40"
              : "text-[var(--color-sidebar-text-muted)]",
          )}
        >
          {collapsed ? <IconChevronRight size={18} /> : <IconChevronLeft size={18} />}
          {!collapsed ? <span>Згорнути</span> : null}
        </button>
        {overlayOpen && collapsed ? (
          <p className="mt-1 text-center text-[10px] font-medium tracking-wide text-[var(--color-sidebar-text-muted)] uppercase">
            Меню
          </p>
        ) : null}
      </div>
    </aside>
    </>
  );
}
