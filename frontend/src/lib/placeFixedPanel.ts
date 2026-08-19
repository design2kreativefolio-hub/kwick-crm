/** Viewport-aware fixed position for portaled dropdowns and date pickers. */

export const Z_MODAL = 200;
export const Z_CONFIRM = 500;
export const Z_POPOVER = 1200;

export type PanelPlacement = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
};

export function placeFixedPanel(
  trigger: DOMRect,
  opts: { width?: number; height: number; gap?: number; pad?: number; minHeight?: number }
): PanelPlacement {
  const gap = opts.gap ?? 6;
  const pad = opts.pad ?? 8;
  const width = Math.max(opts.width ?? trigger.width, 120);
  const maxLeft = Math.max(pad, window.innerWidth - width - pad);
  const left = Math.min(Math.max(pad, trigger.left), maxLeft);
  const spaceBelow = window.innerHeight - trigger.bottom - pad;
  const spaceAbove = trigger.top - pad;
  const openUp = spaceBelow < opts.height && spaceAbove > spaceBelow;
  const available = Math.max(0, (openUp ? spaceAbove : spaceBelow) - gap);
  const fallback = Math.max(120, window.innerHeight - pad * 2);
  const maxHeight = Math.min(opts.height, available > 80 ? available : fallback);
  const top = openUp ? Math.max(pad, trigger.top - maxHeight - gap) : trigger.bottom + gap;
  return { top, left, width, maxHeight, openUp };
}
