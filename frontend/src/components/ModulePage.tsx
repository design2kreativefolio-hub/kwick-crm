export function ModulePage({
  title,
  description,
  endpoint,
}: {
  title: string;
  description: string;
  endpoint: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          {description}
        </p>
      </div>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          This module is scaffolded. The backend API is live at{" "}
          <code
            style={{
              background: "var(--bg)",
              padding: "2px 6px",
              borderRadius: 6,
              color: "var(--gold)",
              fontWeight: 600,
            }}
          >
            {endpoint}
          </code>
          .
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          Screens/tables/forms land in the next iteration — models, permissions and endpoints are
          already in place per the spec.
        </p>
      </div>
    </div>
  );
}
