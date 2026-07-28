"use client";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

export function PageHeader({
  name,
  onRefresh,
  exportData,
  exportFilename = "export.json",
}: {
  name: string;
  onRefresh?: () => void;
  exportData?: unknown;
  exportFilename?: string;
}) {
  const download = () => {
    if (!exportData) return;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-header">
      <h1 className="page-header-title">
        {greeting()}, {name} ☀️
      </h1>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {onRefresh && (
          <button className="icon-btn" onClick={onRefresh} aria-label="Refresh">
            <i className="bi bi-arrow-clockwise" />
          </button>
        )}
        {exportData !== undefined && (
          <button className="btn btn-accent" onClick={download}>
            Export <i className="bi bi-download" />
          </button>
        )}
      </div>
    </div>
  );
}
