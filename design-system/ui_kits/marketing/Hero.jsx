// Marketing — Hero
const Hero = () => (
  <section className="km-hero">
    <div className="km-container">
      <div className="km-eyebrow">
        <Mark size={14} variant="light"/>
        <span>S3-compatible object storage</span>
      </div>
      <h1 className="km-display">Object storage<br/>you actually own.</h1>
      <p className="km-lede">
        A drop-in replacement for S3, built on Walrus and Seal. Sign in with Google,
        pay with a credit card, point your existing AWS SDK at our endpoint —
        keep ownership of every byte.
      </p>
      <div className="km-hero-cta">
        <a className="btn btn-cta btn-lg" href="#">Get started</a>
        <a className="btn btn-secondary btn-lg" href="#docs">Read the docs</a>
      </div>
      <div className="km-hero-meta">
        <span><Dot tone="success"/> 99.99% durability</span>
        <span><Dot tone="success"/> Sealed at rest</span>
        <span><Dot tone="success"/> No wallet required</span>
      </div>
    </div>

    <div className="km-hero-art">
      <div className="km-codecard">
        <div className="km-codecard-head">
          <span className="micro">terminal</span>
          <span className="micro" style={{ marginLeft: "auto" }}>bash</span>
        </div>
        <pre>{`# Works with any S3 SDK.
$ aws s3 cp release.zip \\
    s3://app-uploads-prod/releases/  \\
    --endpoint-url https://s3.kraterion.io

upload: ./release.zip → s3://app-uploads-prod/releases/release.zip
sealed · 5 shards · 0x9c4a…b21f`}</pre>
      </div>

      <div className="km-floatcard km-floatcard-bucket">
        <div className="micro">Bucket</div>
        <div className="km-bucket-name">app-uploads-prod</div>
        <div className="km-bucket-stats">
          <span>12,847 objects</span>
          <span>·</span>
          <span>42.1 GB</span>
        </div>
        <div className="km-bucket-status">
          <Dot tone="success"/> sealed · eu-west-1
        </div>
      </div>

      <div className="km-floatcard km-floatcard-mark">
        <Mark size={56} variant="light" animate="pulse"/>
        <div className="micro" style={{ marginTop: 10 }}>Aperture pulse</div>
      </div>
    </div>
  </section>
);
window.Hero = Hero;
