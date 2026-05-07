// Bucket detail — file browser.
const FILES = [
  { name: "hero/",              kind: "folder", size: "—",      modified: "—",            visibility: "—" },
  { name: "avatars/",           kind: "folder", size: "—",      modified: "—",            visibility: "—" },
  { name: "exports/",           kind: "folder", size: "—",      modified: "—",            visibility: "—" },
  { name: "favicon.ico",        kind: "image",  size: "1.2 KB", modified: "3 weeks ago",  visibility: "public" },
  { name: "og-image-2026.jpg",  kind: "image",  size: "184 KB", modified: "5 days ago",   visibility: "public" },
  { name: "press-kit.zip",      kind: "file",   size: "8.4 MB", modified: "2 days ago",   visibility: "private" },
  { name: "release-notes.md",   kind: "code",   size: "12 KB",  modified: "yesterday",    visibility: "private" },
  { name: "app-bundle.js",      kind: "code",   size: "1.8 MB", modified: "12 minutes ago", visibility: "private" },
  { name: "user-manifest.json", kind: "code",   size: "42 KB",  modified: "an hour ago",  visibility: "private" },
];

const kindIcon = { folder: "folder", image: "image", code: "code", file: "file" };

const BucketDetail = ({ name, onUpload }) => {
  const [selected, setSelected] = React.useState(FILES[5]);
  const [path, setPath] = React.useState([]);
  return (
    <div className="ks-screen ks-bucket-detail">
      <div className="ks-screen-head">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 500, display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="bucket" size={20} style={{ color: "var(--text-secondary)" }}/>
            {name}
          </h1>
          <p className="lead" style={{ fontSize: 14, marginTop: 4 }}>
            12,847 objects · 42.1 GB · eu-west-1 · <Pill>PRIVATE</Pill>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" icon="folder">New folder</Button>
          <Button variant="cta" icon="upload" onClick={onUpload}>Upload</Button>
        </div>
      </div>

      <div className="ks-browser">
        <aside className="ks-tree">
          <div className="micro" style={{ padding: "0 12px 8px" }}>Folders</div>
          {[
            { label: name, depth: 0, active: path.length === 0 },
            { label: "hero", depth: 1 },
            { label: "avatars", depth: 1 },
            { label: "exports", depth: 1 },
            { label: "2026", depth: 2 },
            { label: "2025", depth: 2 },
            { label: "raw", depth: 1 },
          ].map((n, i) => (
            <button key={i} className={"ks-tree-item" + (n.active ? " is-active" : "")} style={{ paddingLeft: 12 + n.depth * 16 }}>
              <Icon name="folder" size={14}/>
              <span>{n.label}</span>
            </button>
          ))}
        </aside>

        <div className="ks-files">
          <div className="ks-files-toolbar">
            <div className="ks-crumbs" style={{ fontSize: 13 }}>
              <span className="ks-crumb">{name}</span>
              <Icon name="chevron" size={12} style={{ color: "var(--text-tertiary)" }}/>
              <span className="ks-crumb">/</span>
            </div>
            <div className="ks-search" style={{ width: 240 }}>
              <Icon name="search" size={14}/>
              <input placeholder="Filter objects" />
            </div>
          </div>

          <div className="ks-table" style={{ borderTop: "none" }}>
            <div className="ks-thead">
              <div style={{ flex: "2 1 0" }}>Name</div>
              <div style={{ flex: "1 1 0" }}>Size</div>
              <div style={{ flex: "1 1 0" }}>Modified</div>
              <div style={{ flex: "1 1 0" }}>Visibility</div>
              <div style={{ width: 28 }}/>
            </div>
            {FILES.map(f => (
              <button
                key={f.name}
                className={"ks-trow" + (selected?.name === f.name ? " is-selected" : "")}
                onClick={() => setSelected(f)}
              >
                <div style={{ flex: "2 1 0", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <Icon name={kindIcon[f.kind]} size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }}/>
                  <span style={{ fontWeight: f.kind === "folder" ? 500 : 400, color: "var(--text-primary)" }}>{f.name}</span>
                </div>
                <div style={{ flex: "1 1 0", color: "var(--text-secondary)" }}>{f.size}</div>
                <div style={{ flex: "1 1 0", color: "var(--text-secondary)" }}>{f.modified}</div>
                <div style={{ flex: "1 1 0" }}>
                  {f.visibility === "—" ? <span style={{ color: "var(--text-tertiary)" }}>—</span>
                    : <Pill>{f.visibility === "public" ? "PUBLIC" : "PRIVATE"}</Pill>}
                </div>
                <div style={{ width: 28, display: "flex", justifyContent: "flex-end" }}>
                  <Icon name="moreVertical" size={14} style={{ color: "var(--text-tertiary)" }}/>
                </div>
              </button>
            ))}
          </div>
        </div>

        <aside className="ks-inspector">
          {selected ? (
            <>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div className="ks-file-preview">
                  <Icon name={kindIcon[selected.kind]} size={28} style={{ color: "var(--text-secondary)" }}/>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, wordBreak: "break-all" }}>{selected.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>{selected.size} · {selected.modified}</div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 14, marginTop: 24 }}>
                <div>
                  <div className="micro" style={{ marginBottom: 6 }}>Public URL</div>
                  <div className="ks-codeline">
                    <span>walrus.kraterion.io/{name}/{selected.name}</span>
                    <Icon name="copy" size={14}/>
                  </div>
                </div>
                <div>
                  <div className="micro" style={{ marginBottom: 6 }}>Object ID</div>
                  <div className="ks-codeline mono">
                    <span>0x9c4a…b21f</span>
                    <Icon name="copy" size={14}/>
                  </div>
                </div>
                <div>
                  <div className="micro" style={{ marginBottom: 6 }}>Stored on</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Walrus · 5 redundant shards · sealed</div>
                </div>
                <div>
                  <div className="micro" style={{ marginBottom: 6 }}>Visibility</div>
                  <Pill>{(selected.visibility === "public" ? "PUBLIC" : "PRIVATE")}</Pill>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
                <Button variant="secondary" icon="download" size="sm">Download</Button>
                <Button variant="secondary" icon="link" size="sm">Copy URL</Button>
                <Button variant="ghost" icon="trash" size="sm" style={{ marginLeft: "auto", color: "var(--error)" }}>Delete</Button>
              </div>
            </>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>Select an object.</div>
          )}
        </aside>
      </div>
    </div>
  );
};

window.BucketDetail = BucketDetail;
