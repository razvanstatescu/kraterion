"use client";

import { useEffect, useState } from "react";
import * as motion from "motion/react-client";
import { cn } from "@/lib/cn";

/**
 * Storage architecture schema — single unified visual that traces a request
 * from the user's S3 client through the Kraterion gateway to the three
 * back-end sub-systems (Seal, Walrus, Sui).
 *
 * Style: hairline boxes, no shadows, single Krater accent on the animated
 * request packet. Brand icons load from /public/brands/.
 */

const VIEW_W = 1200;
const VIEW_H = 540;

const BOX = {
  // Client → Gateway is now a true horizontal arrow because their vertical
  // mid-points match (y + h/2 = 275 for both). Gateway moved right + widened;
  // spine narrowed by the same amount so the right edge stays anchored.
  client: { x: 24, y: 130, w: 268, h: 290 },
  gateway: { x: 412, y: 205, w: 270, h: 140 },
  seal: { x: 782, y: 80, w: 394, h: 128 },
  walrus: { x: 782, y: 224, w: 394, h: 128 },
  sui: { x: 782, y: 368, w: 394, h: 128 },
};

function leftMid(b: typeof BOX.client) {
  return { x: b.x, y: b.y + b.h / 2 };
}
function rightMid(b: typeof BOX.client) {
  return { x: b.x + b.w, y: b.y + b.h / 2 };
}

// Brand icon aspect ratios (sourced from each SVG's viewBox)
const BRAND_ICON: Record<
  "seal" | "walrus" | "sui",
  { aspect: number; height: number }
> = {
  seal: { aspect: 284 / 162, height: 16 },
  walrus: { aspect: 1417 / 931, height: 20 },
  sui: { aspect: 300 / 384, height: 22 },
};

export function StorageSchema({ className }: { className?: string }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    setReduceMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-stone-200/60 bg-cream",
        className
      )}
    >
      {/* Header chrome */}
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Request lifecycle · S3 PUT object
        </span>
        <span className="font-mono text-[11px] text-stone-600">
          SigV4 · HTTPS · multipart
        </span>
      </div>

      <div className="px-4 py-8 md:px-8 md:py-10">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="block w-full"
          role="img"
          aria-label="Kraterion request lifecycle: client to gateway to Seal, Walrus, Sui"
        >
          <defs>
            <marker
              id="schema-arrow-stone"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 Z" fill="#A89C82" />
            </marker>
          </defs>

          {/* Zone labels — centered over each zone */}
          <ZoneLabel x={158} y={70} n="01" label="YOUR SIDE" />
          <ZoneLabel x={547} y={70} n="02" label="KRATERION GATEWAY" />
          <ZoneLabel x={979} y={70} n="03" label="STORAGE SPINE" />

          {/* Faint vertical separators — sit in the middle of each gap */}
          <line
            x1={352}
            y1={96}
            x2={352}
            y2={510}
            stroke="#E1D9C7"
            strokeWidth="1"
            strokeDasharray="2 5"
            opacity="0.7"
          />
          <line
            x1={732}
            y1={96}
            x2={732}
            y2={510}
            stroke="#E1D9C7"
            strokeWidth="1"
            strokeDasharray="2 5"
            opacity="0.7"
          />

          {/* Connectors */}
          <Connectors />

          {/* 01 · Client */}
          <ClientBox />

          {/* 02 · Gateway */}
          <GatewayBox />

          {/* 03 · Spine */}
          <SpineBox
            box={BOX.seal}
            brand="seal"
            role="ENCRYPTION"
            title="Envelope encryption · client-side"
            bullets={[
              "DEK generated on your device",
              "KEK wraps the DEK, gated by policy",
              "Threshold key servers · t-of-n",
            ]}
          />
          <SpineBox
            box={BOX.walrus}
            brand="walrus"
            role="STORAGE"
            title="Ciphertext only · erasure-coded n = 3f + 1"
            bullets={[
              "Content-addressed blobs",
              "Plain HTTPS aggregator read",
              "Zero plaintext on disk",
            ]}
          />
          <SpineBox
            box={BOX.sui}
            brand="sui"
            role="IDENTITY & AUDIT"
            title="Ownership · access policy · history"
            bullets={[
              "Owner = your address, not ours",
              "Revoke is enforced, not promised",
              "Tamper-evident manifest digest",
            ]}
          />

          {/* Client → Gateway label (the only label on the diagram) */}
          <ClientGatewayLabel />

          {/* Animated request packets */}
          {!reduceMotion && <RequestPackets />}
        </svg>
      </div>

      {/* Footer stat band */}
      <div className="grid grid-cols-2 divide-x divide-stone-200/60 border-t border-stone-200/60 bg-stone-50/60 md:grid-cols-4">
        <FootStat label="S3 ops" value="11" hint="Put, Get, Head, List, Multipart…" />
        <FootStat label="Rewrites" value="0" hint="One env var changes" />
        <FootStat label="Plaintext stored" value="0 B" hint="Ciphertext only at rest" accent />
        <FootStat label="Egress" value="$0.00" hint="Read what you store, free" success />
      </div>
    </div>
  );
}

/* ─── Zone label ─────────────────────────────────────────────────── */

function ZoneLabel({
  x,
  y,
  n,
  label,
}: {
  x: number;
  y: number;
  n: string;
  label: string;
}) {
  return (
    <text x={x} y={y} fontSize="11" fontFamily="ui-monospace, monospace" textAnchor="middle">
      <tspan fill="#C45B36" letterSpacing="0.5">{n}</tspan>
      <tspan fill="#7C7158" letterSpacing="1.8" dx="10">
        {label}
      </tspan>
    </text>
  );
}

/* ─── 01 · Client box ────────────────────────────────────────────── */

function ClientBox() {
  const b = BOX.client;
  return (
    <g>
      <rect
        x={b.x}
        y={b.y}
        width={b.w}
        height={b.h}
        rx="8"
        fill="#F8F4EC"
        stroke="#A89C82"
        strokeWidth="1"
      />
      <text
        x={b.x + 18}
        y={b.y + 32}
        fontSize="15"
        fontFamily="Inter, ui-sans-serif"
        fontWeight="500"
        fill="#0F0E0C"
      >
        S3 client
      </text>
      <g transform={`translate(${b.x + b.w - 76}, ${b.y + 18})`}>
        <rect x="0" y="0" width="58" height="20" rx="4" fill="#F1ECE0" stroke="#A89C82" strokeWidth="1" />
        <text x="29" y="14" fontSize="10" fontFamily="ui-monospace, monospace" fill="#5B5142" textAnchor="middle" letterSpacing="1">
          SigV4
        </text>
      </g>
      <text
        x={b.x + 18}
        y={b.y + 54}
        fontSize="12"
        fontFamily="ui-monospace, monospace"
        fill="#7C7158"
      >
        boto3 · aws-cli · rclone · JS SDK
      </text>

      <line
        x1={b.x + 18}
        y1={b.y + 80}
        x2={b.x + b.w - 18}
        y2={b.y + 80}
        stroke="#E1D9C7"
        strokeWidth="1"
      />

      <g fontFamily="ui-monospace, monospace" fontSize="12">
        <text x={b.x + 18} y={b.y + 110}>
          <tspan fill="#7C7158">endpoint_url = </tspan>
          <tspan fill="#5C7A3F">{`"s3.kraterion.com"`}</tspan>
        </text>

        <text x={b.x + 18} y={b.y + 150} fill="#7C7158">
          s3.put_object(
        </text>
        <text x={b.x + 32} y={b.y + 170}>
          <tspan fill="#403930">Bucket=</tspan>
          <tspan fill="#5C7A3F">{`"assets-prod"`}</tspan>
          <tspan fill="#403930">,</tspan>
        </text>
        <text x={b.x + 32} y={b.y + 190}>
          <tspan fill="#403930">Key=</tspan>
          <tspan fill="#5C7A3F">{`"photo.jpg"`}</tspan>
          <tspan fill="#403930">,</tspan>
        </text>
        <text x={b.x + 32} y={b.y + 210} fill="#403930">
          Body=fp,
        </text>
        <text x={b.x + 18} y={b.y + 230} fill="#7C7158">
          )
        </text>
      </g>
    </g>
  );
}

/* ─── 02 · Gateway box ───────────────────────────────────────────── */

function GatewayBox() {
  const b = BOX.gateway;
  return (
    <g>
      <rect
        x={b.x}
        y={b.y}
        width={b.w}
        height={b.h}
        rx="8"
        fill="#F8F4EC"
        stroke="#A89C82"
        strokeWidth="1"
      />
      <text
        x={b.x + 18}
        y={b.y + 32}
        fontSize="15"
        fontFamily="Inter, ui-sans-serif"
        fontWeight="500"
        fill="#0F0E0C"
      >
        Gateway
      </text>
      <text
        x={b.x + 18}
        y={b.y + 54}
        fontSize="11"
        fontFamily="ui-monospace, monospace"
        fill="#7C7158"
      >
        S3-compatible · NestJS + Fastify
      </text>

      <g transform={`translate(${b.x + 18}, ${b.y + 70})`}>
        <PillTag x={0} label="SigV4 auth" />
        <PillTag x={86} label="Multipart" />
        <PillTag x={162} label="Streams" />
      </g>

      <line
        x1={b.x + 18}
        y1={b.y + b.h - 36}
        x2={b.x + b.w - 18}
        y2={b.y + b.h - 36}
        stroke="#E1D9C7"
        strokeWidth="1"
      />
      <text
        x={b.x + 18}
        y={b.y + b.h - 16}
        fontSize="11"
        fontFamily="ui-monospace, monospace"
        fill="#7C7158"
      >
        11 ops · 0 rewrites · TLS 1.3
      </text>
    </g>
  );
}

function PillTag({ x, label }: { x: number; label: string }) {
  const w = label.length * 6.2 + 16;
  return (
    <g transform={`translate(${x}, 0)`}>
      <rect x="0" y="0" width={w} height="20" rx="4" fill="#F1ECE0" stroke="#A89C82" strokeWidth="1" />
      <text x={w / 2} y="14" fontSize="10" fontFamily="ui-monospace, monospace" fill="#5B5142" textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

/* ─── 03 · Spine boxes ───────────────────────────────────────────── */

function SpineBox({
  box,
  brand,
  role,
  title,
  bullets,
}: {
  box: typeof BOX.client;
  brand: "seal" | "walrus" | "sui";
  role: string;
  title: string;
  bullets: string[];
}) {
  const iconCfg = BRAND_ICON[brand];
  const iconW = iconCfg.height * iconCfg.aspect;

  return (
    <g>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx="8"
        fill="#F8F4EC"
        stroke="#A89C82"
        strokeWidth="1"
      />

      {/* Brand icon — anchored top-left, sized at its natural aspect ratio */}
      <image
        href={`/brands/${brand}.svg`}
        x={box.x + 18}
        y={box.y + 14}
        width={iconW}
        height={iconCfg.height}
        preserveAspectRatio="xMinYMid meet"
      />

      {/* Role label next to icon */}
      <text
        x={box.x + 18 + iconW + 14}
        y={box.y + 28}
        fontSize="11"
        fontFamily="ui-monospace, monospace"
        fill="#7C7158"
        letterSpacing="1.4"
      >
        {role}
      </text>

      {/* Title */}
      <text
        x={box.x + 18}
        y={box.y + 62}
        fontSize="14"
        fontFamily="Inter, ui-sans-serif"
        fontWeight="500"
        fill="#0F0E0C"
      >
        {title}
      </text>

      {/* Bullets — stacked vertically */}
      <g
        transform={`translate(${box.x + 18}, ${box.y + 80})`}
        fontFamily="ui-monospace, monospace"
        fontSize="11"
        fill="#5B5142"
      >
        {bullets.map((b, i) => (
          <g key={b} transform={`translate(0, ${i * 16})`}>
            <circle cx="3" cy="6" r="1.75" fill="#A89C82" />
            <text x="14" y="10">
              {b}
            </text>
          </g>
        ))}
      </g>
    </g>
  );
}

/* ─── Connectors ────────────────────────────────────────────────── */

// Gateway is at y=205..345, so distribute the three exit points across
// its right edge at ~25% / 50% / 75% of height.
const GATEWAY_EXITS = {
  seal: { y: 240 },
  walrus: { y: 275 },
  sui: { y: 310 },
};

function Connectors() {
  const cR = rightMid(BOX.client);
  const gL = leftMid(BOX.gateway);
  const gRX = BOX.gateway.x + BOX.gateway.w;

  return (
    <g fill="none" stroke="#A89C82" strokeWidth="1.25">
      <line
        x1={cR.x}
        y1={cR.y}
        x2={gL.x - 6}
        y2={gL.y}
        markerEnd="url(#schema-arrow-stone)"
      />
      <BranchPath
        from={{ x: gRX, y: GATEWAY_EXITS.seal.y }}
        to={leftMid(BOX.seal)}
      />
      <BranchPath
        from={{ x: gRX, y: GATEWAY_EXITS.walrus.y }}
        to={leftMid(BOX.walrus)}
      />
      <BranchPath
        from={{ x: gRX, y: GATEWAY_EXITS.sui.y }}
        to={leftMid(BOX.sui)}
      />
    </g>
  );
}

function BranchPath({
  from,
  to,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
}) {
  const midX = (from.x + to.x) / 2;
  const d = `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x - 6} ${to.y}`;
  return <path d={d} markerEnd="url(#schema-arrow-stone)" />;
}

/* ─── Client → Gateway label (only label on the diagram) ────────── */

function ClientGatewayLabel() {
  const cR = rightMid(BOX.client);
  const gL = leftMid(BOX.gateway);
  const midX = (cR.x + gL.x) / 2;
  const midY = (cR.y + gL.y) / 2;

  return (
    <g>
      <text
        x={midX}
        y={midY - 10}
        fontSize="12"
        fontFamily="ui-monospace, monospace"
        fill="#5B5142"
        textAnchor="middle"
        letterSpacing="0.5"
      >
        PUT object
      </text>
      <text
        x={midX}
        y={midY + 22}
        fontSize="10"
        fontFamily="ui-monospace, monospace"
        fill="#7C7158"
        textAnchor="middle"
      >
        SigV4 · TLS 1.3
      </text>
    </g>
  );
}

/* ─── Animated request packets ───────────────────────────────────── */

function RequestPackets() {
  const cR = rightMid(BOX.client);
  const gL = leftMid(BOX.gateway);
  const gRX = BOX.gateway.x + BOX.gateway.w;
  const sealMid = leftMid(BOX.seal);
  const walrusMid = leftMid(BOX.walrus);
  const suiMid = leftMid(BOX.sui);

  const stageA = 1.1;
  const stageB = 1.2;
  const pause = 1.0;
  const total = stageA + stageB + pause;

  return (
    <g aria-hidden>
      <motion.circle
        r="4"
        fill="#C45B36"
        animate={{
          cx: [cR.x, gL.x, gL.x, cR.x],
          cy: [cR.y, gL.y, gL.y, cR.y],
          opacity: [0, 1, 0, 0],
        }}
        transition={{
          duration: total,
          times: [0, stageA / total, (stageA + 0.05) / total, 1],
          repeat: Infinity,
          ease: "linear",
        }}
      />
      <BranchPacket
        from={{ x: gRX, y: GATEWAY_EXITS.seal.y }}
        to={sealMid}
        startTime={stageA / total}
        duration={stageB / total}
        totalDuration={total}
      />
      <BranchPacket
        from={{ x: gRX, y: GATEWAY_EXITS.walrus.y }}
        to={walrusMid}
        startTime={stageA / total}
        duration={stageB / total}
        totalDuration={total}
      />
      <BranchPacket
        from={{ x: gRX, y: GATEWAY_EXITS.sui.y }}
        to={suiMid}
        startTime={stageA / total}
        duration={stageB / total}
        totalDuration={total}
      />
    </g>
  );
}

function BranchPacket({
  from,
  to,
  startTime,
  duration,
  totalDuration,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  startTime: number;
  duration: number;
  totalDuration: number;
}) {
  const midX = (from.x + to.x) / 2;
  const p1 = startTime;
  const p2 = startTime + duration * 0.4;
  const p3 = startTime + duration * 0.8;
  const p4 = startTime + duration;

  return (
    <motion.circle
      r="3.5"
      fill="#C45B36"
      animate={{
        cx: [from.x, from.x, midX, midX, to.x, to.x],
        cy: [from.y, from.y, from.y, to.y, to.y, to.y],
        opacity: [0, 0, 1, 1, 1, 0],
      }}
      transition={{
        duration: totalDuration,
        times: [0, p1, p1 + 0.01, p2, p3, p4],
        repeat: Infinity,
        ease: "linear",
      }}
    />
  );
}

/* ─── Footer stat ─────────────────────────────────────────────────── */

function FootStat({
  label,
  value,
  hint,
  accent = false,
  success = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  success?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
        {label}
      </span>
      <span
        className={cn(
          "font-mono tabular-nums text-[16px]",
          accent && "text-krater",
          success && "text-[color:var(--color-success)]",
          !accent && !success && "text-ink"
        )}
      >
        {value}
      </span>
      {hint && <span className="text-[11px] text-stone-500">{hint}</span>}
    </div>
  );
}
