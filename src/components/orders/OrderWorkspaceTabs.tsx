"use client";

import { ViewTabs, type TabItem } from "@/components/ui/Tabs";
import { useOrderUnsavedOptional } from "@/components/orders/OrderUnsavedContext";
import { cn } from "@/lib/utils";

export function OrderWorkspaceTabs({
  items,
  active,
  className,
}: {
  items: TabItem[];
  active: string;
  className?: string;
}) {
  const unsaved = useOrderUnsavedOptional();
  return (
    <ViewTabs
      items={items}
      active={active}
      className={cn("w-full justify-end", className)}
      onNavigate={unsaved ? (href) => unsaved.requestNavigate(href) : undefined}
    />
  );
}
