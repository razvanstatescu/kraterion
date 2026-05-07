// Usage & billing screen.
const Usage = () => {
  const days = 30;
  // pseudo-bar values
  const bars = Array.from({ length: days }, (_, i) => 0.4 + 0.5 * Math.abs(Math.sin(i * 0.7)) + (i > 22 ? 0.15 : 0));
  return (
    <div className="ks-screen">
      <div className="ks-screen-head">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 500 }}>Usage</h1>
          <p className="lead" style={{ fontSize: 14, marginTop: 4 }}>May 2026 · 6 days remaining in cycle.</p>
        </div>
        <Button variant="secondary">Export CSV</Button>
      </div>

      <div className="ks-stat-grid">
        {[
          { label: "Storage",   value: "47.3", unit: "GB",  meta: "+ 4.1 GB this month" },
          { label: "Bandwidth", value: "812",  unit: "GB",  meta: "limit 2 TB · 41% used" },
          { label: "Requests",  value: "4.21", unit: "M",   meta: "GET 78% · PUT 22%" },
          { label: "Estimated", value: "$24",  unit: ".80", meta: "billed Jun 1" },
        ].map(s => (
          <Card key={s.label} style={{ padding: 20 }}>
            <div className="micro">{s.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 8 }}>
              <span style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.01em" }}>{s.value}</span>
              <span style={{ fontSize: 16, color: "var(--text-secondary)" }}>{s.unit}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6 }}>{s.meta}</div>
          </Card>
        ))}
      </div>

      <Card style={{ marginTop: 24, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div className="micro">Bandwidth · last 30 days</div>
            <div style={{ fontSize: 18, fontWeight: 500, marginTop: 4 }}>812.4 GB</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" size="sm">7d</Button>
            <Button variant="primary" size="sm">30d</Button>
            <Button variant="ghost" size="sm">90d</Button>
          </div>
        </div>
        <div className="ks-chart">
          {bars.map((h, i) => (
            <div key={i} className="ks-bar" style={{ height: (h * 100) + "%" }}/>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-tertiary)", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.16em" }}>
          <span>Apr 7</span><span>Apr 14</span><span>Apr 21</span><span>Apr 28</span><span>May 6</span>
        </div>
      </Card>
    </div>
  );
};

window.Usage = Usage;
