import { ImageResponse } from "next/og";

export const runtime = "edge";

const CREAM = "#F8F4EC";
const INK = "#0F0E0C";
const KRATER = "#C45B36";
const STONE_500 = "#7C7158";
const STONE_700 = "#403930";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const surface = searchParams.get("surface") ?? "Kraterion";
  const title = searchParams.get("title") ?? "Object storage you actually own.";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: CREAM,
          display: "flex",
          flexDirection: "column",
          padding: "80px 80px 96px",
          fontFamily: "system-ui, sans-serif",
          color: INK,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="44" height="44" viewBox="0 0 256 256">
            <circle cx="128" cy="128" r="110" fill="none" stroke={STONE_500} strokeWidth="10" />
            <circle cx="128" cy="128" r="68" fill="none" stroke={STONE_700} strokeWidth="10" />
            <circle cx="128" cy="128" r="22" fill="#1A1610" />
          </svg>
          <span
            style={{
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: "0.06em",
            }}
          >
            Kraterion
          </span>
        </div>

        <div
          style={{
            marginTop: 80,
            fontSize: 16,
            fontWeight: 500,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: STONE_500,
          }}
        >
          {surface}
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 64,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
            maxWidth: 960,
            color: INK,
          }}
        >
          {title}
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: STONE_500,
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: "0.06em",
          }}
        >
          <span>kraterion.com</span>
          <span style={{ color: KRATER }}>● live</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
