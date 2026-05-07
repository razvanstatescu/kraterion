// Extras — additional shared primitives layered on top of primitives.jsx.
// Drawer · ConfirmModal · OnchainRef · EmptyState · TabbedCode · FormField · Banner.
// Styled via console.css additions.

const Drawer = ({ open, onClose, title, eyebrow, actions, children, width = 440 }) => {
  if (!open) return null;
  return (
    <div className="ks-drawer-scrim" onClick={onClose}>
      <aside className="ks-drawer" style={{ width }} onClick={(e) => e.stopPropagation()}>
        <header className="ks-drawer-head">
          <div>
            {eyebrow ? <div className="ks-drawer-eyebrow">{eyebrow}</div> : null}
            <div className="ks-drawer-title">{title}</div>
          </div>
          <IconButton name="x" onClick={onClose} />
        </header>
        <div className="ks-drawer-body">{children}</div>
        {actions ? <footer className="ks-drawer-foot">{actions}</footer> : null}
      </aside>
    </div>
  );
};

// ConfirmModal — danger-zone confirmation. Two-paragraph copy + on-chain footnote slot.
const ConfirmModal = ({ open, onCancel, onConfirm, title, body, onchainNote, confirmLabel = "Confirm", danger = true }) => {
  if (!open) return null;
  return (
    <div className="ks-modal-scrim" onClick={onCancel}>
      <div className="ks-modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <div className="ks-modal-head">
          <div style={{ fontSize: 18, fontWeight: 500 }}>{title}</div>
          <IconButton name="x" onClick={onCancel} />
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{body}</div>
        {onchainNote ? (
          <div className="ks-onchain-note">
            <Icon name="link-2" size={14} />
            <span>{onchainNote}</span>
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
};

// OnchainRef — `label · mono truncated address · ↗` row. Used wherever an
// on-chain object is referenced (file drawer, activity feed, revocation conf).
const OnchainRef = ({ label, value, href, kind = "address" }) => {
  const truncated = value && value.length > 16
    ? `${value.slice(0, 6)}…${value.slice(-4)}`
    : value;
  return (
    <div className="ks-onchain-row">
      <span className="ks-onchain-label">{label}</span>
      <a className="ks-onchain-value" href={href} target="_blank" rel="noreferrer">
        <span className="ks-onchain-mono">{truncated}</span>
        <Icon name="arrow-up-right" size={12} />
      </a>
    </div>
  );
};

// EmptyState — illustration slot + heading + body + CTA.
const EmptyState = ({ icon = "inbox", title, body, action }) => (
  <div className="ks-empty">
    <div className="ks-empty-icon"><Icon name={icon} size={22} /></div>
    <div className="ks-empty-title">{title}</div>
    {body ? <div className="ks-empty-body">{body}</div> : null}
    {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
  </div>
);

// TabbedCode — quickstart snippet with SDK tabs.
const TabbedCode = ({ tabs, active, onTabChange, children }) => (
  <div className="ks-tabcode">
    <div className="ks-tabcode-tabs">
      {tabs.map((t) => (
        <button
          key={t}
          className={`ks-tabcode-tab ${t === active ? "is-active" : ""}`}
          onClick={() => onTabChange(t)}
        >
          {t}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <button className="ks-tabcode-copy"><Icon name="copy" size={12} />Copy</button>
    </div>
    <div className="ks-codeblock"><pre>{children}</pre></div>
  </div>
);

// FormField — label + control + helper/error wrapper.
const FormField = ({ label, htmlFor, helper, error, required, children }) => (
  <div className="ks-field">
    <label className="ks-field-label" htmlFor={htmlFor}>
      {label}{required ? <span className="ks-field-req">*</span> : null}
    </label>
    {children}
    {error ? <div className="ks-field-error">{error}</div>
      : helper ? <div className="ks-field-helper">{helper}</div> : null}
  </div>
);

// Banner — persistent page-level status (cancelled subscription, revoked access).
// Differs from Toast (transient) — banners stay until the underlying state changes.
const Banner = ({ tone = "info", title, body, action, icon }) => (
  <div className={`ks-banner ks-banner-${tone}`}>
    <div className={`ks-banner-icon ks-banner-icon-${tone}`}>
      <Icon name={icon || (tone === "error" ? "shield-off" : tone === "warning" ? "alert-triangle" : "info")} size={14} />
    </div>
    <div className="ks-banner-text">
      <div className="ks-banner-title">{title}</div>
      {body ? <div className="ks-banner-body">{body}</div> : null}
    </div>
    {action ? <div>{action}</div> : null}
  </div>
);

window.Drawer = Drawer;
window.ConfirmModal = ConfirmModal;
window.OnchainRef = OnchainRef;
window.EmptyState = EmptyState;
window.TabbedCode = TabbedCode;
window.FormField = FormField;
window.Banner = Banner;
