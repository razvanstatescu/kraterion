import { ImageResponse } from "next/og";

export const alt =
  "Kraterion — Object storage you actually own. S3-compatible storage on Walrus, Seal, and Sui.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CREAM = "#F8F4EC";
const INK = "#0F0E0C";
const KRATER = "#C45B36";
const SUCCESS = "#5C7A3F";
const STONE_50 = "#FAF7EF";
const STONE_100 = "#F1ECE0";
const STONE_200 = "#E1D9C7";
const STONE_300 = "#C9BFA8";
const STONE_400 = "#A89C82";
const STONE_500 = "#7C7158";
const STONE_600 = "#5B5142";
const STONE_700 = "#403930";

export default async function Image() {
  const [interMedium, interRegular, mono] = await Promise.all([
    loadInter(500).catch(() => null),
    loadInter(400).catch(() => null),
    loadMono().catch(() => null),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: CREAM,
          display: "flex",
          flexDirection: "column",
          fontFamily: "Inter, system-ui, sans-serif",
          color: INK,
        }}
      >
        {/* === TOP 2/3 — brand bar + tagline + website === */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: "60px 80px 20px",
          }}
        >
          {/* Brand row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <BrandMark size={44} />
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  color: INK,
                }}
              >
                Kraterion
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: STONE_500,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: KRATER,
                }}
              />
              <span>v 0.1 · private beta</span>
              <span
                style={{
                  width: 1,
                  height: 14,
                  background: STONE_300,
                }}
              />
              <span
                style={{
                  fontFamily: "JetBrainsMono, ui-monospace, monospace",
                  letterSpacing: "0.04em",
                  textTransform: "none",
                  color: STONE_600,
                }}
              >
                kraterion.com
              </span>
            </div>
          </div>

          {/* Tagline — single line, centered horizontally and vertically */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "0.24em",
                fontSize: 58,
                fontWeight: 500,
                letterSpacing: "-0.02em",
                lineHeight: 1,
                color: INK,
              }}
            >
              <span>Object storage you</span>
              <span style={{ color: KRATER }}>actually</span>
              <span>own.</span>
            </div>
          </div>
        </div>

        {/* === BOTTOM — dashboard slice. Renders ~360px tall; clips at OG image's bottom edge. === */}
        <div
          style={{
            height: 300,
            display: "flex",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: 980,
              display: "flex",
              flexDirection: "column",
              background: CREAM,
              border: `1px solid ${STONE_300}`,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {/* Browser chrome */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 14px",
                borderBottom: `1px solid ${STONE_200}`,
                background: STONE_50,
              }}
            >
              <div style={{ display: "flex", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: STONE_300 }} />
                <span style={{ width: 10, height: 10, borderRadius: 999, background: STONE_300 }} />
                <span style={{ width: 10, height: 10, borderRadius: 999, background: STONE_300 }} />
              </div>
              <div
                style={{ display: "flex", flex: 1, justifyContent: "center" }}
              >
                <div
                  style={{
                    display: "flex",
                    fontFamily: "JetBrainsMono, ui-monospace, monospace",
                    fontSize: 12,
                    color: STONE_600,
                    background: CREAM,
                    border: `1px solid ${STONE_200}`,
                    borderRadius: 4,
                    padding: "4px 11px",
                  }}
                >
                  <span style={{ color: STONE_400 }}>app.</span>
                  <span style={{ color: KRATER }}>kraterion.com</span>
                  <span style={{ color: STONE_400 }}>/krates</span>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: KRATER,
                }}
              >
                v0.1
              </div>
            </div>

            {/* Body */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "14px 20px",
                gap: 12,
              }}
            >
              {/* Title row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", fontSize: 18, fontWeight: 500, color: INK }}>
                  Your krates
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontFamily: "JetBrainsMono, ui-monospace, monospace",
                      fontSize: 11,
                      color: STONE_700,
                      background: STONE_100,
                      padding: "4px 8px",
                      borderRadius: 4,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: KRATER }} />
                    <span>0xfa…12</span>
                  </div>
                  <div style={{ display: "flex", fontSize: 12, color: STONE_500 }}>
                    2 krates · S3-compatible
                  </div>
                </div>
              </div>

              {/* Create-form row */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  padding: 9,
                  border: `1px dashed ${STONE_300}`,
                  borderRadius: 6,
                  background: STONE_50,
                  alignItems: "center",
                }}
              >
                <Field label="name" value="assets-prod-2" valueColor={INK} flex={1.4} />
                <Field label="region" value="eu-central-1" valueColor={KRATER} flex={1.2} />
                <Field label="access" value="team-write" valueColor={KRATER} flex={1.1} />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: INK,
                    color: CREAM,
                    borderRadius: 4,
                    padding: "8px 12px",
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                >
                  create krate
                </div>
              </div>

              {/* Table — headers + 3 rows. Last row gets clipped by OG bottom edge. */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "5px 8px",
                    borderBottom: `1px solid ${STONE_200}`,
                    fontSize: 9,
                    fontWeight: 500,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: STONE_500,
                  }}
                >
                  <span style={{ flex: "1.3 1 0" }}>krate</span>
                  <span style={{ flex: "0.95 1 0" }}>objects</span>
                  <span style={{ flex: "0.65 1 0" }}>size</span>
                  <span style={{ flex: "1.1 1 0" }}>access</span>
                  <span style={{ flex: "1.1 1 0" }}>created</span>
                </div>
                <Row
                  name="assets-prod"
                  objects="4,812 objects"
                  size="24.6 GB"
                  access="team-read-write"
                  created="18 days ago"
                />
                <Row
                  name="portfolio.zip"
                  objects="1 object"
                  size="2.4 GB"
                  access="private"
                  created="6 days ago"
                />
                <Row
                  name="assets-prod-2"
                  objects="0 objects"
                  size="0 B"
                  access="team-write"
                  created="just now"
                  highlight
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        ...(interMedium
          ? [{ name: "Inter", data: interMedium, weight: 500 as const, style: "normal" as const }]
          : []),
        ...(interRegular
          ? [{ name: "Inter", data: interRegular, weight: 400 as const, style: "normal" as const }]
          : []),
        ...(mono
          ? [{ name: "JetBrainsMono", data: mono, weight: 500 as const, style: "normal" as const }]
          : []),
      ],
    },
  );
}

function BrandMark({ size }: { size: number }) {
  // Canonical "light" variant — three earth-tone rings on cream.
  // Matches design-system/assets/kraterion-light.svg and the
  // dashboard's Mark component.
  return (
    <svg width={size} height={size} viewBox="0 0 256 256">
      <circle cx="128" cy="128" r="110" fill="none" stroke={STONE_500} strokeWidth="10" />
      <circle cx="128" cy="128" r="68" fill="none" stroke={STONE_700} strokeWidth="10" />
      <circle cx="128" cy="128" r="22" fill="#1A1610" />
    </svg>
  );
}

function Field({
  label,
  value,
  valueColor,
  flex,
}: {
  label: string;
  value: string;
  valueColor: string;
  flex: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flex: `${flex} 1 0`,
        background: CREAM,
        border: `1px solid ${STONE_200}`,
        borderRadius: 4,
        padding: "8px 10px",
        fontFamily: "JetBrainsMono, ui-monospace, monospace",
        fontSize: 12,
      }}
    >
      <span style={{ color: STONE_500, fontSize: 10.5, fontWeight: 400 }}>{label}</span>
      <span style={{ color: valueColor, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function Row({
  name,
  objects,
  size: sizeText,
  access,
  created,
  highlight,
}: {
  name: string;
  objects: string;
  size: string;
  access: string;
  created: string;
  highlight?: boolean;
}) {
  const tagBg = highlight ? "rgba(196, 91, 54, 0.12)" : STONE_100;
  const tagFg = highlight ? KRATER : STONE_600;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "11px 8px",
        fontSize: 12,
        background: highlight ? "rgba(196, 91, 54, 0.06)" : "transparent",
        borderBottom: `1px solid ${STONE_100}`,
      }}
    >
      <div
        style={{
          flex: "1.3 1 0",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "JetBrainsMono, ui-monospace, monospace",
          fontWeight: 500,
          color: INK,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 2, background: KRATER }} />
        <span>{name}</span>
      </div>
      <span style={{ flex: "0.95 1 0", color: STONE_600 }}>{objects}</span>
      <div style={{ flex: "0.65 1 0", display: "flex" }}>
        <span
          style={{
            display: "flex",
            background: tagBg,
            color: tagFg,
            fontFamily: "JetBrainsMono, ui-monospace, monospace",
            fontSize: 11,
            padding: "3px 5px",
            borderRadius: 4,
          }}
        >
          {sizeText}
        </span>
      </div>
      <div style={{ flex: "1.1 1 0", display: "flex" }}>
        <span
          style={{
            display: "flex",
            background: tagBg,
            color: tagFg,
            fontFamily: "JetBrainsMono, ui-monospace, monospace",
            fontSize: 11,
            padding: "3px 5px",
            borderRadius: 4,
          }}
        >
          {access}
        </span>
      </div>
      <div
        style={{
          flex: "1.1 1 0",
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: STONE_600,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 999, background: SUCCESS }} />
        <span>{created}</span>
      </div>
    </div>
  );
}

async function loadInter(weight: 400 | 500): Promise<ArrayBuffer> {
  // Satori (next/og) supports TTF/OTF/WOFF — not WOFF2.
  // Old-Android UA forces Google Fonts to return TTF.
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&display=swap`,
    { headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 4.0.4)" } },
  ).then((r) => r.text());
  const url = css.match(/url\((https:\/\/[^)]+\.ttf)\)/)?.[1];
  if (!url) throw new Error("TTF URL not found in Google Fonts CSS");
  return fetch(url).then((r) => r.arrayBuffer());
}

async function loadMono(): Promise<ArrayBuffer> {
  const css = await fetch(
    "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&display=swap",
    { headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 4.0.4)" } },
  ).then((r) => r.text());
  const url = css.match(/url\((https:\/\/[^)]+\.ttf)\)/)?.[1];
  if (!url) throw new Error("Mono TTF URL not found");
  return fetch(url).then((r) => r.arrayBuffer());
}
