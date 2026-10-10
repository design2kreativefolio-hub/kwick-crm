"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";

import { Z_MODAL } from "@/lib/placeFixedPanel";

async function cropToBlob(imageSrc: string, pixelCrop: Area, type: "image/jpeg" | "image/png"): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", reject);
    img.crossOrigin = "anonymous";
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  const size = Math.min(Math.round(pixelCrop.width), Math.round(pixelCrop.height), 512);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  if (type === "image/jpeg") {
    // JPEG has no alpha — paint white so transparent PNGs don't turn black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
  }
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    size,
    size
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Crop failed"))),
      type,
      0.92
    );
  });
}

export function AvatarCropModal({
  open,
  imageSrc,
  onClose,
  onCropped,
  shape = "round",
  title = "Crop photo",
  outputType,
}: {
  open: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onCropped: (file: File) => void | Promise<void>;
  /** "round" for profile photos, "rect" (square) for logos. */
  shape?: "round" | "rect";
  title?: string;
  /** Defaults to JPEG for round photos and PNG (keeps transparency) for logos. */
  outputType?: "image/jpeg" | "image/png";
}) {
  const type = outputType ?? (shape === "rect" ? "image/png" : "image/jpeg");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Keep latest callbacks without re-binding effects (avoids open/close thrash).
  const onCloseRef = useRef(onClose);
  const onCroppedRef = useRef(onCropped);
  onCloseRef.current = onClose;
  onCroppedRef.current = onCropped;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setArea(null);
      setBusy(false);
    }
  }, [open, imageSrc]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy]);

  const onCropComplete = useCallback((_cropped: Area, pixels: Area) => {
    setArea(pixels);
  }, []);

  const apply = async () => {
    if (!imageSrc || !area) return;
    setBusy(true);
    try {
      const blob = await cropToBlob(imageSrc, area, type);
      const file = new File([blob], type === "image/png" ? "cropped.png" : "cropped.jpg", { type });
      await onCroppedRef.current(file);
      onCloseRef.current();
    } catch {
      // The caller reports upload errors itself; keep the dialog open to retry.
    } finally {
      setBusy(false);
    }
  };

  if (!mounted || !open || !imageSrc) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCloseRef.current();
      }}
    >
      <div className="card" style={card} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 6px", fontSize: 17, color: "var(--navy)" }}>{title}</h3>
        <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>
          {shape === "round" ? "Drag to reposition, then zoom to fit the circle." : "Drag to reposition, then zoom to fit the square."}
        </p>

        {/* Fixed box — cropper CSS positions absolutely inside this */}
        <div style={cropStage} className="kwick-avatar-crop-stage">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            minZoom={1}
            maxZoom={3}
            aspect={1}
            cropShape={shape}
            showGrid={false}
            objectFit="contain"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <label style={zoomRow}>
          <span className="muted" style={{ fontSize: 12.5, minWidth: 40 }}>
            Zoom
          </span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ flex: 1, accentColor: "var(--gold, #3673fc)", minWidth: 0 }}
            aria-label="Zoom"
          />
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onCloseRef.current()}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={apply}
            disabled={busy || !area}
          >
            {busy ? "Saving…" : "Use photo"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: Z_MODAL,
  background: "rgba(5, 8, 18, 0.62)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 440,
  maxHeight: "calc(100dvh - 32px)",
  overflowY: "auto",
  padding: "20px 22px",
  boxShadow: "0 24px 64px rgba(0, 0, 0, 0.35)",
  position: "relative",
  zIndex: 1,
  transform: "none",
};

const cropStage: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "min(300px, 52dvh)",
  minHeight: 200,
  background: "#0b1020",
  touchAction: "none",
  borderRadius: 12,
  overflow: "hidden",
  isolation: "isolate",
};

const zoomRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginTop: 14,
};

/**
 * Pick-then-crop helper: call `start(file)` with the chosen file, render
 * `cropModal` once, and `onCropped` receives the cropped File to upload.
 */
export function useImageCrop(
  onCropped: (file: File) => void | Promise<void>,
  options?: { shape?: "round" | "rect"; title?: string }
) {
  const srcRef = useRef<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);

  const close = useCallback(() => {
    if (srcRef.current) {
      URL.revokeObjectURL(srcRef.current);
      srcRef.current = null;
    }
    setSrc(null);
  }, []);

  const start = useCallback((file: File | null | undefined) => {
    if (!file) return;
    if (srcRef.current) URL.revokeObjectURL(srcRef.current);
    const url = URL.createObjectURL(file);
    srcRef.current = url;
    setSrc(url);
  }, []);

  useEffect(
    () => () => {
      if (srcRef.current) URL.revokeObjectURL(srcRef.current);
    },
    []
  );

  const cropModal = (
    <AvatarCropModal
      open={!!src}
      imageSrc={src}
      onClose={close}
      onCropped={onCropped}
      shape={options?.shape}
      title={options?.title}
    />
  );

  return { start, cropModal };
}
