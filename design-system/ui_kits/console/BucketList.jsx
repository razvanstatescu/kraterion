// Buckets list screen.
const BUCKETS = [
  { name: "app-uploads-prod",  region: "eu-west-1", objects: 12847, size: "42.1 GB",  visibility: "private", status: "active",  age: "2 hours ago" },
  { name: "app-uploads-staging", region: "eu-west-1", objects: 1204, size: "3.8 GB", visibility: "private", status: "active",  age: "yesterday" },
  { name: "marketing-assets",  region: "us-east-1", objects: 318,   size: "812 MB",  visibility: "public",  status: "active",  age: "3 days ago" },
  { name: "user-exports",      region: "eu-west-1", objects: 89,    size: "1.4 GB",  visibility: "private", status: "syncing", age: "12 minutes ago" },
  { name: "raw-events",        region: "us-east-1", objects: 4_120_889, size: "2.1 TB", visibility: "private", status: "active", age: "live" },
];

const BucketList = ({ onOpen, onCreate }) => (
  <div className="ks-screen">
    <div className="ks-screen-head">
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 500 }}>Buckets</h1>
        <p className="lead" style={{ fontSize: 14, marginTop: 4 }}>5 buckets across 2 regions.</p>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <div className="ks-search">
          <Icon name="search" size={14}/>
          <input placeholder="Search buckets" />
        </div>
        <Button variant="cta" icon="plus" onClick={onCreate}>Create bucket</Button>
      </div>
    </div>

    <div className="ks-table">
      <div className="ks-thead">
        <div style={{ flex: "2 1 0" }}>Name</div>
        <div style={{ flex: "1 1 0" }}>Region</div>
        <div style={{ flex: "1 1 0" }}>Objects</div>
        <div style={{ flex: "1 1 0" }}>Size</div>
        <div style={{ flex: "1 1 0" }}>Visibility</div>
        <div style={{ flex: "1 1 0" }}>Status</div>
        <div style={{ width: 32 }}/>
      </div>
      {BUCKETS.map(b => (
        <button key={b.name} className="ks-trow" onClick={() => onOpen(b.name)}>
          <div style={{ flex: "2 1 0", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <Icon name="bucket" size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }}/>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{b.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>updated {b.age}</div>
            </div>
          </div>
          <div style={{ flex: "1 1 0", color: "var(--text-secondary)", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }}>{b.region}</div>
          <div style={{ flex: "1 1 0", color: "var(--text-secondary)" }}>{b.objects.toLocaleString()}</div>
          <div style={{ flex: "1 1 0", color: "var(--text-secondary)" }}>{b.size}</div>
          <div style={{ flex: "1 1 0" }}>
            <Pill>{b.visibility === "public" ? "PUBLIC" : "PRIVATE"}</Pill>
          </div>
          <div style={{ flex: "1 1 0" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
              <Dot tone={b.status === "syncing" ? "warning" : "success"}/>
              {b.status === "syncing" ? "Syncing" : "Active"}
            </span>
          </div>
          <div style={{ width: 32, display: "flex", justifyContent: "flex-end" }}>
            <Icon name="chevron" size={14} style={{ color: "var(--text-tertiary)" }}/>
          </div>
        </button>
      ))}
    </div>
  </div>
);

window.BucketList = BucketList;
window.BUCKETS = BUCKETS;
