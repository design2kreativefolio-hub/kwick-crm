"use client";

export function MaintenanceNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className="maintenance-notice" role="status">
      <i className="bi bi-tools" aria-hidden />
      <div>
        <strong>Under maintenance</strong>
        <p>
          {compact
            ? "Only the developer account can sign in right now."
            : "Kwick is temporarily closed for updates. Only the developer account can sign in. Everyone else, please try again shortly."}
        </p>
      </div>
    </div>
  );
}
