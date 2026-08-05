"use client";

import { ImageUploadField } from "./ImageUploadField";

// Any number of images, not just one — each uploaded slot can be replaced
// or removed, and there's always one trailing empty slot to add another.
export function ImageGalleryField({
  proposalId,
  urls,
  onChange,
  label,
}: {
  proposalId: number;
  urls: string[];
  onChange: (urls: string[]) => void;
  label?: string;
}) {
  const updateAt = (idx: number, url: string) => {
    if (url) {
      onChange(urls.map((u, i) => (i === idx ? url : u)));
    } else {
      onChange(urls.filter((_, i) => i !== idx));
    }
  };
  const addNew = (url: string) => {
    if (url) onChange([...urls, url]);
  };

  return (
    <div>
      {label && (
        <label className="field-label" style={{ marginTop: 0 }}>
          {label}
        </label>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {urls.map((url, idx) => (
          <ImageUploadField key={idx} proposalId={proposalId} value={url} onChange={(u) => updateAt(idx, u)} />
        ))}
        <ImageUploadField proposalId={proposalId} value="" onChange={addNew} />
      </div>
    </div>
  );
}
