// Marketing — Pricing + How + Footer
const HowItWorks = () => (
  <section className="km-section km-section-ink" id="how">
    <div className="km-container">
      <div className="km-section-head">
        <span className="micro" style={{ color: "var(--stone-400)" }}>How it works</span>
        <h2 className="km-h2" style={{ color: "var(--cream)" }}>The same API, a different floor.</h2>
        <p className="km-lead-secondary" style={{ color: "var(--stone-300)" }}>
          Three layers. Familiar at the top, owned at the bottom.
        </p>
      </div>
      <div className="km-stack">
        {[
          { n: "01", title: "S3-compatible API",      body: "PUT, GET, DELETE, multipart upload, presigned URLs, lifecycle rules, versioning. Behaves the same as the AWS endpoint your code already targets." },
          { n: "02", title: "Sealed by Seal",         body: "Each object is encrypted with a per-bucket key managed by Seal. We never hold plaintext." },
          { n: "03", title: "Stored on Walrus, addressed on Sui", body: "Bytes are sharded across Walrus nodes; the manifest of what you own is anchored on Sui. Ownership outlives us." },
        ].map(s => (
          <div key={s.n} className="km-stack-row">
            <span className="km-stack-n">{s.n}</span>
            <div>
              <div className="km-stack-title">{s.title}</div>
              <p className="km-stack-body">{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Pricing = () => {
  const tiers = [
    { name: "Hobby",  price: "$0",  unit: "/ month", note: "5 GB storage · 50 GB bandwidth", highlight: false,
      features: ["Up to 3 buckets", "Community support", "Sealed at rest"] },
    { name: "Team",   price: "$24", unit: "/ month", note: "+ $0.018/GB beyond 200 GB",      highlight: true,
      features: ["200 GB included", "Unlimited buckets", "Custom domains", "Email support"] },
    { name: "Scale",  price: "Custom", unit: "",     note: "Volume pricing & SLAs",          highlight: false,
      features: ["Dedicated regions", "Sealed-keys export", "Priority support", "DPA & SOC 2"] },
  ];
  return (
    <section className="km-section" id="pricing">
      <div className="km-container">
        <div className="km-section-head">
          <span className="micro">Pricing</span>
          <h2 className="km-h2">Pay for what you store.</h2>
          <p className="km-lead-secondary">No retrieval fees. No egress traps. No "enterprise" surcharge for keeping the lights on.</p>
        </div>
        <div className="km-tier-grid">
          {tiers.map(t => (
            <article key={t.name} className={"km-tier" + (t.highlight ? " is-highlight" : "")}>
              <div className="micro">{t.name}</div>
              <div className="km-tier-price">
                <span>{t.price}</span>
                <span className="km-tier-unit">{t.unit}</span>
              </div>
              <p className="km-tier-note">{t.note}</p>
              <ul className="km-tier-list">
                {t.features.map(f => <li key={f}><Icon name="check" size={14}/>{f}</li>)}
              </ul>
              <a className={t.highlight ? "btn btn-cta" : "btn btn-secondary"} href="#" style={{ width: "100%" }}>
                {t.name === "Scale" ? "Talk to us" : "Get started"}
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

const Footer = () => (
  <footer className="km-footer">
    <div className="km-container km-footer-inner">
      <div className="km-footer-brand">
        <div className="km-brand">
          <Mark size={28} variant="dark"/>
          <span style={{ color: "var(--cream)" }}>Kraterion</span>
        </div>
        <p>Object storage you actually own. Built on Walrus, Sui, and Seal.</p>
      </div>
      <div className="km-footer-cols">
        {[
          { title: "Product", items: ["Console", "Docs", "API reference", "Status"] },
          { title: "Company", items: ["About", "Pricing", "Security", "Contact"] },
          { title: "Legal",   items: ["Terms", "Privacy", "DPA", "SOC 2"] },
        ].map(col => (
          <div key={col.title}>
            <div className="micro" style={{ color: "var(--stone-400)" }}>{col.title}</div>
            <ul>{col.items.map(it => <li key={it}><a href="#">{it}</a></li>)}</ul>
          </div>
        ))}
      </div>
    </div>
    <div className="km-container km-footer-base">
      <span>© 2026 Kraterion Labs</span>
      <span>eu-west-1 · us-east-1 · ap-southeast-1</span>
    </div>
  </footer>
);

window.HowItWorks = HowItWorks;
window.Pricing = Pricing;
window.Footer = Footer;
