"use client";

/* ============================================================
   Architecture diagram — animated, three-tier
   ----------------------------------------------------------------
   Hybrid render: HTML cards positioned absolutely inside a
   fixed-aspect container (1200×540 viewBox), an inline <svg>
   overlay drawing the connection paths, and SMIL <animateMotion>
   driving dots along those paths.

   Coordinate system: every position (cards via %, paths via SVG
   units) lives in the same 1200×540 space, so nothing drifts.
   ============================================================ */

type NodeKind = "client" | "service" | "data" | "chain";
type FlowKind = "write" | "read" | "renew";
type Brand = "walrus" | "seal" | "sui";

/* Flow groups — drive the hover-highlight system.
   Each node and each path belongs to one or more groups. Hovering a node
   brightens every element that shares a group with it, so the *entire*
   reachable flow lights up — not just direct neighbours. */
type FlowGroup = "data" | "control" | "background";

type ArchNode = {
  id: string;
  label: string;
  sublabel?: string;
  kind: NodeKind;
  brand?: Brand;
  tip: string;
  groups: FlowGroup[];
  pos: { left: string; top: string; width: string; height: string };
};

type ArchPath = {
  id: string;
  kind: FlowKind;
  d: string;
  begin: string;
  dur: string;
  from: string;
  to: string;
  group: FlowGroup;
};

const NODES: ArchNode[] = [
  /* Tier 1 — User */
  {
    id: "browser",
    label: "Browser",
    sublabel: "Dashboard · zkLogin",
    kind: "client",
    groups: ["data"],
    tip: "Your dashboard runs in the browser. zkLogin signs every action with your Sui address — no wallet extension needed.",
    pos: { left: "16.67%", top: "3.7%", width: "16.67%", height: "14.81%" },
  },
  {
    id: "sdk",
    label: "S3 SDK",
    sublabel: "aws-cli · boto3 · …",
    kind: "client",
    groups: ["data"],
    tip: "Same s3:// API as AWS. Point your existing tooling at s3.kraterion.com — bytes hit the same gateway as the dashboard.",
    pos: { left: "66.67%", top: "3.7%", width: "16.67%", height: "14.81%" },
  },

  /* Tier 2 — Kraterion */
  {
    id: "gateway",
    label: "Gateway",
    sublabel: "S3-compatible front door",
    kind: "service",
    groups: ["data"],
    tip: "Authenticates every request, seals each object with a fresh AES key, hands the sealed bytes to Walrus and the envelope to Seal — and zeroes key material from RAM the moment a request finishes.",
    pos: { left: "12.5%", top: "38.9%", width: "16.67%", height: "14.81%" },
  },
  {
    id: "control",
    label: "Control plane",
    sublabel: "Bucket lifecycle",
    kind: "service",
    groups: ["control"],
    tip: "Bucket settings, account state, audit feed. Read-mostly and well off the hot data path.",
    pos: { left: "41.67%", top: "38.9%", width: "16.67%", height: "14.81%" },
  },
  {
    id: "worker",
    label: "Worker",
    sublabel: "Renewals · event indexer",
    kind: "service",
    groups: ["control", "background"],
    tip: "Two jobs in one process: extends the on-chain SharedBlob storage epoch so krates never expire, and tails Sui events so the dashboard reflects on-chain state in real time.",
    pos: { left: "70.83%", top: "38.9%", width: "16.67%", height: "14.81%" },
  },
  {
    id: "postgres",
    label: "Postgres",
    kind: "data",
    groups: ["control"],
    tip: "Bucket and object metadata, encryption envelopes, sealed identities. Never holds plaintext bytes.",
    pos: { left: "43%", top: "61%", width: "7.5%", height: "10%" },
  },
  {
    id: "redis",
    label: "Redis",
    kind: "data",
    groups: ["control", "background"],
    tip: "Session-key cache and BullMQ queues for the renewal + indexer worker.",
    pos: { left: "51%", top: "61%", width: "7.5%", height: "10%" },
  },

  /* Tier 3 — Chain */
  {
    id: "walrus",
    label: "Walrus",
    sublabel: "Encrypted blob storage",
    kind: "chain",
    brand: "walrus",
    groups: ["data"],
    tip: "Decentralised blob storage. Stores only sealed bytes — Walrus itself never sees plaintext.",
    pos: { left: "10.5%", top: "80%", width: "20%", height: "17%" },
  },
  {
    id: "seal",
    label: "Seal",
    sublabel: "Decentralised key servers",
    kind: "chain",
    brand: "seal",
    groups: ["data"],
    tip: "Identity-based encryption from Mysten Labs. Independent key servers, run by separate operators, must agree (after the on-chain access policy passes) before a byte can be decrypted.",
    pos: { left: "40%", top: "80%", width: "20%", height: "17%" },
  },
  {
    id: "sui",
    label: "Sui Move",
    sublabel: "SharedBlob, owned by you",
    kind: "chain",
    brand: "sui",
    groups: ["data", "background"],
    tip: "On-chain truth. Each krate is a SharedBlob you own; access is gated by a Move policy you can revoke in one PTB. Revoke and Kraterion can no longer decrypt — even if we wanted to.",
    pos: { left: "69.5%", top: "80%", width: "20%", height: "17%" },
  },
];

/* Animated flow paths. SVG viewBox is 1200×540. Both clients (browser, SDK)
   feed the same Gateway. Write paths fan out from three different Gateway exit
   points so they don't all bundle on the left and crash through the data plane. */
const PATHS: ArchPath[] = [
  /* WRITE / upload — krater · data flow */
  { id: "w1", kind: "write", group: "data", from: "browser", to: "gateway", d: "M 300 100 C 300 160 220 160 220 210", begin: "0s",   dur: "3.6s" },
  { id: "w5", kind: "write", group: "data", from: "sdk",     to: "gateway", d: "M 870 100 C 870 170 280 170 280 210", begin: "0.5s", dur: "3.6s" },
  { id: "w3", kind: "write", group: "data", from: "gateway", to: "walrus",  d: "M 200 290 V 432",                     begin: "1.0s", dur: "3.6s" },
  { id: "w2", kind: "write", group: "data", from: "gateway", to: "seal",    d: "M 250 290 C 250 415 600 415 600 432", begin: "1.5s", dur: "3.6s" },
  { id: "w4", kind: "write", group: "data", from: "gateway", to: "sui",     d: "M 310 290 C 310 420 920 420 920 432", begin: "2.0s", dur: "3.6s" },

  /* READ / download — stone-700 · data flow */
  { id: "r1", kind: "read",  group: "data", from: "walrus",  to: "gateway", d: "M 240 432 V 290",                     begin: "0.3s", dur: "4.2s" },
  { id: "r2", kind: "read",  group: "data", from: "seal",    to: "gateway", d: "M 600 432 C 600 415 290 415 290 290", begin: "1.0s", dur: "4.2s" },
  { id: "r3", kind: "read",  group: "data", from: "gateway", to: "browser", d: "M 290 210 C 290 160 350 160 350 100", begin: "2.1s", dur: "4.2s" },
  { id: "r4", kind: "read",  group: "data", from: "gateway", to: "sdk",     d: "M 320 210 C 320 175 870 175 870 100", begin: "2.6s", dur: "4.2s" },

  /* BACKGROUND — success · maintenance flow.
     Worker both renews the SharedBlob storage epoch (down) and indexes
     on-chain events (up). Two parallel paths with a small x offset. */
  { id: "n1", kind: "renew", group: "background", from: "worker", to: "sui",    d: "M 940 290 V 432", begin: "0s",   dur: "5s" },
  { id: "n2", kind: "renew", group: "background", from: "sui",    to: "worker", d: "M 970 432 V 290", begin: "2.5s", dur: "5s" },
];

/* Static context wires (no animation). De-emphasised, just to anchor the cards. */
const CONTEXT_PATHS: { d: string; from: string; to: string; group: FlowGroup }[] = [
  { group: "control", from: "gateway", to: "control",  d: "M 350 250 H 500" },
  { group: "control", from: "control", to: "worker",   d: "M 700 250 H 850" },
  { group: "control", from: "control", to: "postgres", d: "M 561 290 V 329" },
  { group: "control", from: "control", to: "redis",    d: "M 657 290 V 329" },
];

const TIER_LABELS = [
  { id: "you", label: "You", note: "your machine, your keys" },
  { id: "kraterion", label: "Kraterion", note: "stateless data path · revocable" },
  { id: "chain", label: "Chain", note: "decentralised, owned by you" },
];

/* Mobile chain — flattened essential path for narrow viewports */
const MOBILE_CHAIN: { id: string; label: string; sub?: string; tier: string }[] = [
  { id: "browser", label: "Browser or S3 SDK", sub: "Your client", tier: "You" },
  { id: "gateway", label: "Gateway", sub: "Sealed in transit", tier: "Kraterion" },
  { id: "seal",    label: "Seal",    sub: "Decentralised key servers", tier: "Chain" },
  { id: "walrus",  label: "Walrus",  sub: "Encrypted blob storage", tier: "Chain" },
  { id: "sui",     label: "Sui Move", sub: "SharedBlob, owned by you", tier: "Chain" },
];

export function Architecture() {
  return (
    <section className="arch" aria-labelledby="arch-title">
      <header className="arch-head">
        <div className="arch-eyebrow">Under the hood</div>
        <h2 className="arch-title" id="arch-title">
          Your bytes, end&#8209;to&#8209;end.
        </h2>
        <p className="arch-sub">
          A request leaves your machine, gets sealed in our gateway, lands on Walrus,
          and is owned by you on Sui. Revoke our access anytime — the krate stays.
        </p>
      </header>

      <div className="arch-stage">
        {/* Tier rails on the left — context for what each row is */}
        <ul className="arch-rails" aria-hidden="true">
          {TIER_LABELS.map((t) => (
            <li key={t.id} className={`arch-rail arch-rail--${t.id}`}>
              <span className="arch-rail-label">{t.label}</span>
              <span className="arch-rail-note">{t.note}</span>
            </li>
          ))}
        </ul>

        <div className="arch-canvas">
          {/* Connection wires + animated dots, beneath cards */}
          <svg
            className="arch-svg"
            viewBox="0 0 1200 540"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* Static context (very faint) */}
            {CONTEXT_PATHS.map((p, i) => (
              <path
                key={`ctx-${i}`}
                d={p.d}
                className="arch-line arch-line--ctx"
                data-groups={p.group}
              />
            ))}
            {/* Flow paths (dashed wire) */}
            {PATHS.map((p) => (
              <path
                key={p.id}
                id={`arch-${p.id}`}
                d={p.d}
                className={`arch-line arch-line--${p.kind}`}
                data-groups={p.group}
              />
            ))}
            {/* Animated dots travelling along each flow path */}
            {PATHS.map((p) => (
              <circle
                key={`d-${p.id}`}
                r="4.5"
                className={`arch-dot arch-dot--${p.kind}`}
                data-groups={p.group}
              >
                <animateMotion
                  dur={p.dur}
                  begin={p.begin}
                  repeatCount="indefinite"
                  rotate="auto"
                >
                  <mpath href={`#arch-${p.id}`} />
                </animateMotion>
              </circle>
            ))}
          </svg>

          {/* Card nodes — HTML on top of SVG */}
          {NODES.map((n) => (
            <div
              key={n.id}
              className={`arch-node arch-node--${n.kind}${n.brand ? " has-brand" : ""}`}
              style={n.pos}
              tabIndex={0}
              data-tip={n.tip}
              data-node={n.id}
              data-groups={n.groups.join(" ")}
            >
              {n.brand && (
                /* eslint-disable @next/next/no-img-element */
                <img
                  src={`/brands/${n.brand}.svg`}
                  alt=""
                  className={`arch-brand arch-brand--${n.brand}`}
                />
                /* eslint-enable @next/next/no-img-element */
              )}
              <span className="arch-node-label">{n.label}</span>
              {n.sublabel && <span className="arch-node-sub">{n.sublabel}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile fallback — vertical chain, only visible at narrow widths */}
      <ol className="arch-mobile" aria-label="Architecture chain">
        {MOBILE_CHAIN.map((step, i) => (
          <li key={step.id} className="arch-mstep">
            <span className="arch-mtier">{step.tier}</span>
            <div className="arch-mcard">
              <span className="arch-mlabel">{step.label}</span>
              {step.sub && <span className="arch-msub">{step.sub}</span>}
            </div>
            {i < MOBILE_CHAIN.length - 1 && (
              <span className="arch-mlink" aria-hidden="true">
                <span className="arch-mlink-dot" />
              </span>
            )}
          </li>
        ))}
      </ol>

      <footer className="arch-legend" aria-label="Diagram legend">
        <span className="arch-legend-item">
          <span className="arch-legend-dot arch-legend-dot--write" />
          Upload — sealed, then stored
        </span>
        <span className="arch-legend-item">
          <span className="arch-legend-dot arch-legend-dot--read" />
          Download — verified, then unsealed
        </span>
        <span className="arch-legend-item">
          <span className="arch-legend-dot arch-legend-dot--renew" />
          Background — renewals and chain events
        </span>
      </footer>
    </section>
  );
}
