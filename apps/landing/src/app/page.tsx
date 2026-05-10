"use client";

import { useEffect, useRef, useState } from "react";
import { Architecture } from "./Architecture";

const X_URL = "https://x.com/kraterion";
const CONTACT_EMAIL = "hello@kraterion.com";
const WALRUS_URL = "https://www.walrus.xyz";
const SEAL_URL = "https://seal.mystenlabs.com";
const SUI_URL = "https://sui.io";

export default function Home() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [discovered, setDiscovered] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const openDrawer = () => {
    setDrawerOpen(true);
    setDiscovered(true);
  };
  const closeDrawer = () => setDrawerOpen(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen]);

  return (
    <div className="page">
      {/* TOP */}
      <header className="topbar">
        <a className="brand" href="#" aria-label="Kraterion">
          <svg
            className="brand-mark"
            viewBox="0 0 256 256"
            width="22"
            height="22"
            aria-hidden="true"
          >
            <circle cx="128" cy="128" r="110" fill="none" stroke="#7C7158" strokeWidth="10" />
            <circle cx="128" cy="128" r="68" fill="none" stroke="#403930" strokeWidth="10" />
            <circle cx="128" cy="128" r="22" fill="#1A1610" />
          </svg>
          <span className="brand-name">Kraterion</span>
        </a>
        <div className="topbar-meta">
          <span className="topbar-version">v 0.1 · private beta</span>
          <span className="live-dot">
            <span className="ldot" /> Coming soon
          </span>
        </div>
      </header>

      {/* STAGE */}
      <main className="stage">
        <div className="col-solo">
          <div className="dash-wrap">
            <div className="dash-chrome">
              <div className="dash-bar">
                <div className="dash-traffic">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="dash-url">
                  <svg
                    className="dash-url-lock"
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                  <span className="pad">app.</span>
                  <span className="k">kraterion.com</span>
                  <span className="pad">/krates</span>
                </div>
                <div className="dash-ver">v0.1</div>
              </div>

              <div className="dash-body">
                <div className="dash-title">
                  <h3>Your krates</h3>
                  <div className="dash-meta-stack">
                    <span
                      className="dash-owner-badge"
                      tabIndex={0}
                      data-tip="Your Sui address. Every krate lives here, signed off by you. Click to view on-chain."
                    >
                      <span className="dot" />
                      0xfa…12
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M7 17 17 7" />
                        <path d="M7 7h10v10" />
                      </svg>
                    </span>
                    <span className="dash-meta">2 krates · S3-compatible</span>
                  </div>
                </div>

                <div className="dash-create" aria-hidden="true">
                  <div className="dash-field">
                    <span className="lbl">name</span>
                    <span className="typed t1">assets-prod-2</span>
                  </div>
                  <div className="dash-field">
                    <span className="lbl">region</span>
                    <span className="typed t2">eu-central-1</span>
                  </div>
                  <div className="dash-field">
                    <span className="lbl">access</span>
                    <span className="typed t3">team-write</span>
                  </div>
                  <button className="dash-btn" type="button" tabIndex={-1}>
                    create krate
                  </button>
                </div>

                <div className="dash-table">
                  <div className="dash-trh">
                    <span>krate</span>
                    <span>objects</span>
                    <span>size</span>
                    <span>access</span>
                    <span>created</span>
                  </div>
                  <div className="dash-tr">
                    <span className="dash-name">assets-prod</span>
                    <span className="dash-num">4,812 objects</span>
                    <span className="dash-tag">24.6 GB</span>
                    <span className="dash-tag">team-read-write</span>
                    <span className="dash-created">18 days ago</span>
                  </div>
                  <div className="dash-tr">
                    <span className="dash-name">portfolio.zip</span>
                    <span className="dash-num">1 object</span>
                    <span className="dash-tag">2.4 GB</span>
                    <span className="dash-tag">private</span>
                    <span className="dash-created">6 days ago</span>
                  </div>
                  <div
                    className={`dash-tr new${discovered ? " discovered" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-label="Inspect krate assets-prod-2"
                    onClick={openDrawer}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDrawer();
                      }
                    }}
                  >
                    <span className="dash-name">assets-prod-2</span>
                    <span className="dash-num">0 objects</span>
                    <span className="dash-tag">0 B</span>
                    <span className="dash-tag k">team-write</span>
                    <span className="dash-created">just now</span>
                    <span className="row-cursor" aria-hidden="true">
                      <svg width="48" height="48" viewBox="0 0 24 24">
                        <path
                          d="M5.5 3.5l13 7.5-5.5 1.5-1.5 5.5-6-14.5z"
                          fill="#C45B36"
                          stroke="#F8F4EC"
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                </div>

                <div className="dash-trust">
                  <div className="dash-pills">
                    <span
                      className="dash-pill"
                      tabIndex={0}
                      data-tip="Walrus testnet · Red Stuff erasure coding · n=3f+1 nodes · 2-day epochs · blob_id 0x9c4a…b21f"
                    >
                      <span className="d" />
                      Stored on Walrus
                    </span>
                    <span
                      className="dash-pill"
                      tabIndex={0}
                      data-tip="BLS12-381 IBE + AES-256-GCM · t=2 of 3 key servers · per-object identity {pkg}{innerId}"
                    >
                      <span className="d" />
                      Sealed by you
                    </span>
                    <span
                      className="dash-pill"
                      tabIndex={0}
                      data-tip="Move package 0xkrater… · revocable in one PTB · object 0x4d…0e9 · zkLogin signed"
                    >
                      <span className="d" />
                      Owned on Sui
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="dash-caption">
              {/* Static SVG brand monograms — next/image adds no value for these. */}
              {/* eslint-disable @next/next/no-img-element */}
              Stored on
              <a
                href={WALRUS_URL}
                target="_blank"
                rel="noreferrer"
                className="brand-link"
              >
                <img
                  src="/brands/walrus.svg"
                  alt="Walrus"
                  className="brand-icon brand-walrus"
                />
              </a>
              , secured with
              <a
                href={SEAL_URL}
                target="_blank"
                rel="noreferrer"
                className="brand-link"
              >
                <img
                  src="/brands/seal.svg"
                  alt="Seal"
                  className="brand-icon brand-seal"
                />
              </a>
              , coordinated on
              <a
                href={SUI_URL}
                target="_blank"
                rel="noreferrer"
                className="brand-link"
              >
                <img
                  src="/brands/sui.svg"
                  alt="Sui"
                  className="brand-icon brand-sui"
                />
              </a>
              .
              {/* eslint-enable @next/next/no-img-element */}
              <span className="sdk-postscript">
                via @mysten/walrus, @mysten/seal, @mysten/sui
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* ARCHITECTURE — animated three-tier diagram below the hero */}
      <Architecture />

      {/* BOTTOM */}
      <section className="footer-row">
        <div className="pitch">
          <h1>
            Object storage<br />you <span className="accent">actually</span> own.
          </h1>
          <p>
            We&apos;re cooking something up. Same <code>s3://</code> API, same{" "}
            <code>aws s3 cp</code> commands, same boring billing — one quiet difference
            underneath. Delete your account tomorrow; your krates are still yours{" "}
            <span className="promise">— and only you hold the keys.</span>
          </p>
        </div>

        <div className="follow">
          <span className="follow-label">Stay close · no newsletter, no spam</span>
          <a
            className="follow-btn"
            href={X_URL}
            target="_blank"
            rel="noreferrer"
          >
            <svg
              className="follow-x"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              aria-hidden="true"
            >
              <path
                d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                fill="currentColor"
              />
            </svg>
            <span className="follow-text">Follow @kraterion</span>
            <svg
              className="follow-arrow"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 17 17 7" />
              <path d="M7 7h10v10" />
            </svg>
          </a>
          <a className="follow-email" href={`mailto:${CONTACT_EMAIL}`}>
            or write to us at <span className="mono">{CONTACT_EMAIL}</span>
          </a>
        </div>
      </section>

      {/* STRIP */}
      <footer className="strip">
        <div>© 2026 Kraterion</div>
        <div className="tickers">
          <span>sealed at rest</span>
          <span>·</span>
          <span className="ticker-mono">s3.kraterion.com</span>
          <span>·</span>
          <span className="ticker-status">
            <span className="dot" /> operational
          </span>
        </div>
      </footer>

      {/* DRAWER */}
      <div
        className={`krate-drawer-scrim${drawerOpen ? " open" : ""}`}
        onClick={closeDrawer}
        aria-hidden={!drawerOpen}
      >
        <aside
          className="krate-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="krate-drawer-title"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="kd-head">
            <div>
              <div className="kd-eyebrow">krate</div>
              <div className="kd-title" id="krate-drawer-title">assets-prod-2</div>
            </div>
            <button
              ref={closeBtnRef}
              className="kd-x"
              onClick={closeDrawer}
              aria-label="Close drawer"
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </header>

          <div className="kd-body">
            <section className="kd-section">
              <h4 className="kd-section-title">Bucket</h4>
              <dl className="kd-rows">
                <div className="kd-row"><dt>Region</dt><dd>eu-central-1</dd></div>
                <div className="kd-row"><dt>Access</dt><dd>team-write</dd></div>
                <div className="kd-row"><dt>Objects</dt><dd>0</dd></div>
                <div className="kd-row"><dt>Size</dt><dd>0 B</dd></div>
                <div className="kd-row"><dt>Created</dt><dd>just now</dd></div>
              </dl>
            </section>

            <section className="kd-section">
              <h4 className="kd-section-title">Use it like S3</h4>
              <pre className="kd-code"><code>{`aws s3 cp portfolio.zip \\
  s3://assets-prod-2/ \\
  --endpoint https://s3.kraterion.com \\
  --region eu-central-1`}</code></pre>
              <p className="kd-caption">
                Same SDK. Same commands. The bucket lives somewhere new.
              </p>
            </section>

            <section className="kd-section">
              <h4 className="kd-section-title">On-chain</h4>
              <dl className="kd-rows">
                <div className="kd-row">
                  <dt>Owner</dt>
                  <dd className="mono">
                    0xfa…12
                    <ArrowExternal />
                  </dd>
                </div>
                <div className="kd-row">
                  <dt>Bucket object</dt>
                  <dd className="mono">
                    0x4d2f…0e9c
                    <ArrowExternal />
                  </dd>
                </div>
                <div className="kd-row">
                  <dt>Access policy</dt>
                  <dd className="mono policy">
                    0x4f…1ab3::access::seal_approve_private
                    <ArrowExternal />
                  </dd>
                </div>
              </dl>
              <a
                className="kd-audit-btn"
                href="#"
                onClick={(e) => e.preventDefault()}
                aria-label="View bucket audit log on Sui — coming soon"
              >
                <span>View audit log</span>
                <span className="kd-audit-count">· 47 events</span>
                <ArrowExternal />
              </a>
              <p className="kd-audit-note">
                Every put, get, and revoke on this bucket is recorded on Sui as a
                verifiable event. Anyone with the bucket address can replay the
                full history.
              </p>
            </section>

            <div className="kd-callout">
              Even if Kraterion shuts down tomorrow, this krate stays on Walrus. Always yours.
            </div>
          </div>

          <footer className="kd-foot">
            <button className="kd-btn ghost" onClick={closeDrawer} type="button">
              Close
            </button>
            <a
              className="kd-btn primary"
              href={X_URL}
              target="_blank"
              rel="noreferrer"
              onClick={closeDrawer}
            >
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                aria-hidden="true"
              >
                <path
                  d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                  fill="currentColor"
                />
              </svg>
              <span>Follow @kraterion</span>
            </a>
          </footer>
        </aside>
      </div>
    </div>
  );
}

function ArrowExternal() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}
