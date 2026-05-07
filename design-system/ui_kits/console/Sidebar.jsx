// Sidebar — left nav.
const Sidebar = ({ route, onNavigate }) => {
  const items = [
    { id: "buckets", label: "Buckets", icon: "bucket" },
    { id: "keys",    label: "Access keys", icon: "key" },
    { id: "usage",   label: "Usage", icon: "chart" },
    { id: "settings",label: "Settings", icon: "settings" },
  ];
  const isActive = (id) => route.screen === id || (id === "buckets" && route.screen === "bucket");
  return (
    <aside className="ks-sidebar">
      <div className="ks-brand" onClick={() => onNavigate({ screen: "buckets" })}>
        <Mark size={28} variant="light"/>
        <span className="ks-wordmark">Kraterion</span>
      </div>
      <nav className="ks-nav">
        {items.map(it => (
          <button
            key={it.id}
            className={"ks-navitem" + (isActive(it.id) ? " is-active" : "")}
            onClick={() => onNavigate({ screen: it.id })}
          >
            <Icon name={it.icon} size={16}/>
            <span>{it.label}</span>
          </button>
        ))}
      </nav>
      <div className="ks-org">
        <div className="micro" style={{ marginBottom: 6 }}>Project</div>
        <div className="ks-orgname">acme-prod</div>
        <div className="ks-orgmeta">eu-west-1 · 3 buckets</div>
      </div>
      <div className="ks-account">
        <div className="ks-avatar">M</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Maya Petrescu</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>maya@acme.io</div>
        </div>
        <Icon name="chevronDown" size={14}/>
      </div>
    </aside>
  );
};
window.Sidebar = Sidebar;
