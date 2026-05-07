// Marketing — Logos strip
const LogoStrip = () => (
  <section className="km-logos">
    <div className="km-container">
      <div className="micro" style={{ textAlign: "center", color: "var(--text-tertiary)" }}>
        Trusted by teams shipping to millions
      </div>
      <div className="km-logo-row">
        {["northwind", "stellar/labs", "atlas.eng", "cobalt", "harbor.dev", "ridgepoint"].map(name => (
          <div key={name} className="km-logo-item">{name}</div>
        ))}
      </div>
    </div>
  </section>
);
window.LogoStrip = LogoStrip;

// Marketing — Feature grid
const Features = () => {
  const features = [
    { icon: "key",     title: "Bring your AWS SDK",  body: "boto3, AWS SDK for JS, s3cmd, rclone, mc — point them at our endpoint and they work. No new client to learn." },
    { icon: "lock",    title: "Sealed at rest",      body: "Every object is encrypted by Seal before it touches storage. We never hold the keys to your data." },
    { icon: "bucket",  title: "True ownership",      body: "Your buckets are addressed on Sui. If we disappear tomorrow, your bytes don't." },
    { icon: "chart",   title: "Predictable pricing", body: "Pay per gigabyte stored and gigabyte transferred. No retrieval fees. No egress traps." },
    { icon: "upload",  title: "Web2 onboarding",     body: "Sign in with Google. Pay with a credit card. The user never sees a wallet." },
    { icon: "settings",title: "S3 semantics",        body: "Versioning, lifecycle rules, access policies, presigned URLs — the parts of S3 you depend on, kept." },
  ];
  return (
    <section className="km-section" id="product">
      <div className="km-container">
        <div className="km-section-head">
          <span className="micro">Product</span>
          <h2 className="km-h2">Built for teams that read the AWS docs.</h2>
          <p className="km-lead-secondary">
            Kraterion sits at the same layer as Supabase Storage or DigitalOcean Spaces, and speaks fluent S3 to your existing code.
          </p>
        </div>
        <div className="km-feature-grid">
          {features.map(f => (
            <article key={f.title} className="km-feature">
              <Icon name={f.icon} size={20}/>
              <h3 className="km-h3">{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
window.Features = Features;
