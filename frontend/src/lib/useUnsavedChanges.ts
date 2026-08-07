"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useConfirm } from "@/components/ConfirmDialog";

const LEAVE_MESSAGE = "Are you sure you want to exit without saving? Your changes will be lost.";

/** Track whether `value` differs from the last clean snapshot. */
export function useDirtySnapshot(value: unknown, ready: boolean) {
  const snapRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!ready) {
      snapRef.current = null;
      setDirty(false);
      return;
    }
    const encoded = JSON.stringify(value);
    if (snapRef.current === null) {
      snapRef.current = encoded;
      setDirty(false);
      return;
    }
    setDirty(encoded !== snapRef.current);
  }, [value, ready]);

  const markClean = useCallback((nextValue?: unknown) => {
    snapRef.current = JSON.stringify(nextValue !== undefined ? nextValue : value);
    setDirty(false);
  }, [value]);

  return { dirty, markClean };
}

/**
 * Warns when leaving a dirty form: browser close/refresh (native dialog),
 * in-app link clicks (custom confirm), and browser Back (custom confirm).
 */
export function useUnsavedChanges(dirty: boolean) {
  const { confirm, ConfirmDialog } = useConfirm();
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const bypassRef = useRef(false);

  const askToLeave = useCallback(async () => {
    if (!dirtyRef.current || bypassRef.current) return true;
    return confirm(LEAVE_MESSAGE, {
      title: "Unsaved Changes",
      confirmLabel: "Leave Without Saving",
      cancelLabel: "Stay",
      danger: true,
    });
  }, [confirm]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current || bypassRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || bypassRef.current) return;
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      if (/^https?:\/\//i.test(href)) {
        try {
          const url = new URL(href);
          if (url.origin !== window.location.origin) return;
        } catch {
          return;
        }
      }

      e.preventDefault();
      e.stopPropagation();

      void (async () => {
        const ok = await askToLeave();
        if (!ok) return;
        bypassRef.current = true;
        dirtyRef.current = false;
        router.push(href);
      })();
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [askToLeave, router]);

  useEffect(() => {
    if (!dirty) return;

    const onPopState = () => {
      if (!dirtyRef.current || bypassRef.current) return;
      history.pushState(null, "", window.location.href);
      void (async () => {
        const ok = await askToLeave();
        if (!ok) return;
        bypassRef.current = true;
        dirtyRef.current = false;
        router.back();
      })();
    };

    history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [dirty, askToLeave, router]);

  return { ConfirmDialog, askToLeave };
}
