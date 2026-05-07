// Marketing — Header
const Header = () => (
  <header className="km-header">
    <div className="km-header-inner">
      <a className="km-brand" href="#">
        <Mark size={28} variant="light"/>
        <span>Kraterion</span>
      </a>
      <nav className="km-nav">
        <a href="#product">Product</a>
        <a href="#how">How it works</a>
        <a href="#pricing">Pricing</a>
        <a href="#docs">Docs</a>
      </nav>
      <div className="km-header-cta">
        <a className="km-link" href="#">Sign in</a>
        <a className="btn btn-primary" href="#">Get started</a>
      </div>
    </div>
  </header>
);
window.Header = Header;
