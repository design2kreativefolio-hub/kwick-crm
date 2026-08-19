"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";

import { Z_MODAL } from "@/lib/placeFixedPanel";

async function cropToBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
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
      "image/jpeg",
      0.92
    );
  });
}

export function AvatarCropModal({
  open,
  imageSrc,
  onClose,
  onCropped,
}: {
  open: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onCropped: (file: File) => void | Promise<void>;
}) {
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
      const blob = await cropToBlob(imageSrc, area);
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      await onCroppedRef.current(file);
      onCloseRef.current();
    } finally {
      setBusy(false);
    }
  };

  if (!mounted || !open || !imageSrc) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop photo"
      style={overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCloseRef.current();
      }}
    >
      <div className="card" style={card} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 6px", fontSize: 17 }}>Crop photo</h3>
        <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>
          Drag to reposition, then zoom to fit the circle.
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
            cropShape="round"
            showGrid={false}
            objectFit="horizontal-cover"
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
            style={{ flex: 1 }}
          />
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
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
  padding: "20px 22px",
  boxShadow: "0 24px 64px rgba(0, 0, 0, 0.35)",
  position: "relative",
  zIndex: 1,
  transform: "none",
};

const cropStage: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: 280,
  minHeight: 280,
  maxHeight: 280,
  background: "#111",
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
