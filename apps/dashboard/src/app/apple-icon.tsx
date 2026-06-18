import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#F8F4EC",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Canonical "light" variant — three earth-tone rings on cream.
            Matches design-system/assets/kraterion-light.svg and the
            dashboard's Mark component. */}
        <svg width="124" height="124" viewBox="0 0 256 256">
          <circle cx="128" cy="128" r="110" fill="none" stroke="#7C7158" strokeWidth="10" />
          <circle cx="128" cy="128" r="68" fill="none" stroke="#403930" strokeWidth="10" />
          <circle cx="128" cy="128" r="22" fill="#1A1610" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
