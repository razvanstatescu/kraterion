// Topbar — breadcrumbs + right-aligned actions slot.
const Topbar = ({ crumbs = [], actions = null }) => (
  <header className="ks-topbar">
    <div className="ks-crumbs">
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Icon name="chevron" size={12} style={{ color: "var(--text-tertiary)" }}/>}
          {c.onClick
            ? <button className="ks-crumb-link" onClick={c.onClick}>{c.label}</button>
            : <span className="ks-crumb">{c.label}</span>}
        </React.Fragment>
      ))}
    </div>
    <div className="ks-topbar-actions">
      {actions}
    </div>
  </header>
);
window.Topbar = Topbar;
