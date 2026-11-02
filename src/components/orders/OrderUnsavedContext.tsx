"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";

type OrderUnsavedContextValue = {
  /** Register / clear a named dirty source (multiple can be dirty at once). */
  setWorkspaceDirty: (key: string, dirty: boolean) => void;
  /**
   * Returns false when navigation should be blocked (caller must preventDefault).
   * Opens confirm dialog when dirty, or when leaving the order card.
   */
  requestNavigate: (href: string) => boolean;
};

const OrderUnsavedContext = createContext<OrderUnsavedContextValue | null>(null);

function orderBaseFromPath(pathname: string) {
  const match = pathname.match(/^\/orders\/[^/]+/);
  return match?.[0] ?? pathname;
}

function resolveHref(href: string) {
  return new URL(href, window.location.href);
}

function isLeavingOrder(href: string, orderBase: string) {
  try {
    const url = resolveHref(href);
    if (url.origin !== window.location.origin) return true;
    const path = url.pathname.replace(/\/$/, "") || "/";
    const base = orderBase.replace(/\/$/, "");
    return path !== base && !path.startsWith(`${base}/`);
  } catch {
    return true;
  }
}

export function OrderUnsavedProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const orderBase = orderBaseFromPath(pathname);
  const dirtyKeysRef = useRef(new Set<string>());
  const [dirtyCount, setDirtyCount] = useState(0);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const isDirty = useCallback(() => dirtyKeysRef.current.size > 0, []);

  const setWorkspaceDirty = useCallback((key: string, dirty: boolean) => {
    if (dirty) dirtyKeysRef.current.add(key);
    else dirtyKeysRef.current.delete(key);
    setDirtyCount(dirtyKeysRef.current.size);
  }, []);

  const blockAndConfirm = useCallback((href: string) => {
    const url = resolveHref(href);
    setPendingHref(`${url.pathname}${url.search}${url.hash}`);
    setLeaveOpen(true);
    return false;
  }, []);

  const requestNavigate = useCallback(
    (href: string) => {
      const leaving = isLeavingOrder(href, orderBase);
      if (!leaving && !isDirty()) return true;
      return blockAndConfirm(href);
    },
    [blockAndConfirm, isDirty, orderBase],
  );

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return;
      const leaving = isLeavingOrder(href, orderBase);
      if (!leaving && !isDirty()) return;
      event.preventDefault();
      event.stopPropagation();
      blockAndConfirm(href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [blockAndConfirm, isDirty, orderBase]);

  const value = useMemo(
    () => ({ setWorkspaceDirty, requestNavigate }),
    [setWorkspaceDirty, requestNavigate],
  );

  const unsaved = dirtyCount > 0;

  return (
    <OrderUnsavedContext.Provider value={value}>
      {children}
      <UnsavedChangesDialog
        open={leaveOpen}
        title={unsaved ? "Незбережені зміни" : "Залишити замовлення?"}
        description={
          unsaved
            ? "Є незбережені зміни. Якщо перейти в інше меню, їх буде втрачено."
            : "Вийти з картки замовлення і відкрити інший розділ?"
        }
        onStay={() => {
          setLeaveOpen(false);
          setPendingHref(null);
        }}
        onDiscard={() => {
          const href = pendingHref;
          dirtyKeysRef.current.clear();
          setDirtyCount(0);
          setLeaveOpen(false);
          setPendingHref(null);
          if (href) router.push(href);
        }}
      />
    </OrderUnsavedContext.Provider>
  );
}

export function useOrderUnsavedOptional() {
  return useContext(OrderUnsavedContext);
}

/** Register this component's dirty flag under a stable unique key. */
export function useOrderUnsavedWorkspaceDirty(dirty: boolean) {
  const ctx = useOrderUnsavedOptional();
  const key = useId();
  useEffect(() => {
    ctx?.setWorkspaceDirty(key, dirty);
    return () => ctx?.setWorkspaceDirty(key, false);
  }, [ctx, dirty, key]);
}
