"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Overlay";

type AskOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type NoticeOptions = {
  title?: string;
  message: string;
};

type DialogState =
  | ({ kind: "ask" } & AskOptions)
  | ({ kind: "notice" } & NoticeOptions);

/** In-app replacement for window.confirm and window.alert. */
export function useAppDialog() {
  const [state, setState] = useState<DialogState | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const finish = useCallback((ok: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setState(null);
    resolve?.(ok);
  }, []);

  const ask = useCallback((options: AskOptions) => {
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setState({ kind: "ask", ...options });
    });
  }, []);

  const notice = useCallback((options: NoticeOptions) => {
    resolver.current?.(false);
    return new Promise<void>((resolve) => {
      resolver.current = () => resolve();
      setState({ kind: "notice", ...options });
    });
  }, []);

  const view =
    state?.kind === "ask" ? (
      <Modal
        open
        onClose={() => finish(false)}
        title={state.title}
        width="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => finish(false)}>
              {state.cancelLabel ?? "Скасувати"}
            </Button>
            <Button
              variant={state.danger ? "danger" : "primary"}
              size="sm"
              onClick={() => finish(true)}
            >
              {state.confirmLabel ?? "Підтвердити"}
            </Button>
          </>
        }
      >
        <p className="text-[14px] leading-5 text-[var(--color-text-primary)]">{state.message}</p>
      </Modal>
    ) : state?.kind === "notice" ? (
      <Modal
        open
        onClose={() => finish(true)}
        title={state.title ?? "Повідомлення"}
        width="sm"
        footer={
          <Button variant="primary" size="sm" onClick={() => finish(true)}>
            Закрити
          </Button>
        }
      >
        <p className="text-[14px] leading-5 text-[var(--color-text-primary)]">{state.message}</p>
      </Modal>
    ) : null;

  return { ask, notice, view };
}
