"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

/** Slim top bar: starts when an internal link is clicked, completes when the route changes. */
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "run" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const first = useRef(true);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || /^(https?:|mailto:|tel:)/.test(href)) return;
      if (href === window.location.pathname + window.location.search) return;
      clearTimeout(timer.current);
      setState("run");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setState("done");
    timer.current = setTimeout(() => setState("idle"), 450);
    return () => clearTimeout(timer.current);
  }, [pathname, search]);

  if (state === "idle") return null;
  return <div className={`route-progress is-${state}`} aria-hidden />;
}

export function RouteProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
