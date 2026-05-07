// Access keys screen.
const KEYS = [
  { id: "AKIA-PROD-7G2N",   name: "production app server",   created: "Mar 12, 2026", lastUsed: "2 minutes ago", scope: "read · write",  bucket: "app-uploads-prod" },
  { id: "AKIA-CI-9F1X",     name: "CI / GitHub Actions",     created: "Feb 3, 2026",  lastUsed: "an hour ago",   scope: "write only",    bucket: "all" },
  { id: "AKIA-RO-3JK8",     name: "analytics read-only",     created: "Jan 22, 2026", lastUsed: "yesterday",     scope: "read",          bucket: "raw-events" },
  { id: "AKIA-LEGACY-2K7",  name: "legacy backup script",    created: "Aug 4, 2025",  lastUsed: "47 days ago",   scope: "read",          bucket: "user-exports" },
];

const AccessKeys = ({ onCreate }) => (
  <div className="ks-screen">
    <div className="ks-screen-head">
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 500 }}>Access keys</h1>
        <p className="lead" style={{ fontSize: 14, marginTop: 4, maxWidth: 540 }}>
          Use access keys with any S3-compatible client. We never see the secret after you create it.
        </p>
      </div>
      <Button variant="cta" icon="plus" onClick={onCreate}>New key</Button>
    </div>

    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div className="ks-table" style={{ border: "none" }}>
        <div className="ks-thead">
          <div style={{ flex: "2 1 0" }}>Name</div>
          <div style={{ flex: "2 1 0" }}>Key ID</div>
          <div style={{ flex: "1 1 0" }}>Scope</div>
          <div style={{ flex: "1 1 0" }}>Last used</div>
          <div style={{ width: 32 }}/>
        </div>
        {KEYS.map(k => (
          <div key={k.id} className="ks-trow" style={{ cursor: "default" }}>
            <div style={{ flex: "2 1 0", display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="key" size={16} style={{ color: "var(--text-secondary)" }}/>
              <div>
                <div style={{ fontWeight: 500 }}>{k.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>created {k.created}</div>
              </div>
            </div>
            <div style={{ flex: "2 1 0", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13, color: "var(--text-secondary)" }}>
              {k.id}····
            </div>
            <div style={{ flex: "1 1 0" }}>
              <Pill>{k.scope.toUpperCase()}</Pill>
            </div>
            <div style={{ flex: "1 1 0", color: "var(--text-secondary)" }}>{k.lastUsed}</div>
            <div style={{ width: 32, display: "flex", justifyContent: "flex-end" }}>
              <Icon name="moreVertical" size={14} style={{ color: "var(--text-tertiary)" }}/>
            </div>
          </div>
        ))}
      </div>
    </Card>

    <div style={{ marginTop: 32 }}>
      <div className="micro" style={{ marginBottom: 8 }}>S3 endpoint</div>
      <div className="ks-codeblock">
        <pre>{`# any S3-compatible SDK
endpoint = "https://s3.kraterion.io"
region   = "eu-west-1"

aws --endpoint-url $endpoint s3 ls s3://app-uploads-prod/`}</pre>
      </div>
    </div>
  </div>
);

window.AccessKeys = AccessKeys;
