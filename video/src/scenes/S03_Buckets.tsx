import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { space } from "../tokens/spacing";
import {
  DashboardShell,
  BucketsList,
  FileList,
  InspectorDrawer,
  KnowledgeSearch,
  BucketRowData,
  FileRowData,
} from "../components/Dashboard";
import { AnimatedCursor } from "../components/AnimatedCursor";
import { EASE_BRAND, EASE_EXPO } from "../motion/easings";

/**
 * S03 — INTERACTIVE SESSION (24 s).
 *
 * One continuous shot of someone using the product. Per research, the
 * single biggest delta from "video" to "watching someone use a real app"
 * is **causation** — every UI change must visibly follow a cursor click
 * by 2–3 frames. Nothing happens on its own.
 *
 * Event timeline (frames @ 30 fps):
 *   18   cursor enters from off-screen
 *   55   cursor lands on `research-notes/` row (hover)
 *   80   cursor CLICKS row
 *   83   view transitions to file browser inside the bucket
 *  140   cursor lands on a file row (hover)
 *  170   cursor CLICKS file
 *  173   Inspector drawer slides in from right
 *  220   cursor lands on "On-chain" header
 *  255   cursor CLICKS
 *  258   OwnershipCard expands, "(you)" badge appears in krater
 *  340   cursor leaves Inspector, heads for "Knowledge" tab in sidebar
 *  395   cursor CLICKS "Knowledge"
 *  398   KnowledgeSearch view fades in
 *  450   cursor moves to search input
 *  470   query types out, character-by-character
 *  555   cursor lands on "Ask" button
 *  580   cursor CLICKS "Ask"
 *  583   result hits cascade in
 *  720   scene ends
 *
 * The view-state switches (buckets → files → inspector → knowledge) are
 * crossfades over 12 frames, but the trigger is always the click that
 * precedes them by 2–3 frames. This is what sells the interactivity.
 */

const BUCKETS: BucketRowData[] = [
  { name: "documents/",          objects: "28",    size: "312 MB",  access: "Granted", visibility: "Private", created: "12d ago" },
  { name: "research-notes/",     objects: "142",   size: "1.4 GB",  access: "Granted", visibility: "Private", created: "3d ago",  knowledge: true },
  { name: "kraterion-handbook/", objects: "7",     size: "84 KB",   access: "Granted", visibility: "Public",  created: "1d ago" },
  { name: "archive-2025/",       objects: "1,247", size: "14.2 GB", access: "Granted", visibility: "Private", created: "8mo ago" },
];

const FILES: FileRowData[] = [
  { name: "2026-overflow-thesis.md", size: "14.2 kB", modified: "3d ago",  status: "indexed" },
  { name: "walrus-cost-model.md",    size: "6.8 kB",  modified: "5d ago",  status: "sealed" },
  { name: "seal-envelope-flow.md",   size: "11.4 kB", modified: "1w ago",  status: "sealed" },
  { name: "dashboard-copy.md",       size: "3.1 kB",  modified: "2w ago",  status: "encrypting" },
];

export const S03_Buckets: React.FC = () => {
  const frame = useCurrentFrame();

  // ── Event frames ─────────────────────────────────────────────────────────
  const CURSOR_ENTERS       = 18;
  const HOVER_BUCKET        = 55;
  const CLICK_BUCKET        = 80;     // cursor arrives, then auto-holds 6 then clicks at 86
  const SWITCH_TO_FILES     = 88;     // 2 frames after the click
  const HOVER_FILE          = 140;
  const CLICK_FILE          = 170;
  const INSPECTOR_OPEN      = 178;
  const HOVER_ONCHAIN       = 220;
  const CLICK_ONCHAIN       = 255;
  const ONCHAIN_EXPAND      = 263;
  const HOVER_KNOWLEDGE_NAV = 340;
  const CLICK_KNOWLEDGE_NAV = 395;
  const SWITCH_TO_KNOWLEDGE = 403;
  const HOVER_INPUT         = 450;
  const TYPE_START          = 480;
  const HOVER_ASK           = 555;
  const CLICK_ASK           = 580;
  const RESULTS_SHOW        = 588;

  // ── View state interpolation ─────────────────────────────────────────────
  // Three views: bucket-list, file-browser, knowledge.
  // bucketListOpacity: visible from start to SWITCH_TO_FILES
  // fileBrowserOpacity: visible from SWITCH_TO_FILES to SWITCH_TO_KNOWLEDGE
  // knowledgeOpacity: visible from SWITCH_TO_KNOWLEDGE onward
  const bucketListOpacity = interpolate(
    frame,
    [SWITCH_TO_FILES - 6, SWITCH_TO_FILES + 6],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_BRAND },
  );
  const fileBrowserOpacity = interpolate(
    frame,
    [SWITCH_TO_FILES - 4, SWITCH_TO_FILES + 6, SWITCH_TO_KNOWLEDGE - 6, SWITCH_TO_KNOWLEDGE + 6],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_BRAND },
  );
  const knowledgeOpacity = interpolate(
    frame,
    [SWITCH_TO_KNOWLEDGE - 4, SWITCH_TO_KNOWLEDGE + 6],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_BRAND },
  );

  // ── Inspector drawer slide ───────────────────────────────────────────────
  const inspectorTx = interpolate(
    frame,
    [INSPECTOR_OPEN, INSPECTOR_OPEN + 18],
    [480, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_EXPO },
  );
  const inspectorExit = interpolate(
    frame,
    [HOVER_KNOWLEDGE_NAV - 8, HOVER_KNOWLEDGE_NAV + 4],
    [0, 480],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_EXPO },
  );
  const drawerX = inspectorTx + inspectorExit;

  // ── Background dim while inspector is open ───────────────────────────────
  const dimOpacity = interpolate(
    frame,
    [INSPECTOR_OPEN, INSPECTOR_OPEN + 18, HOVER_KNOWLEDGE_NAV - 8, HOVER_KNOWLEDGE_NAV + 4],
    [0, 0.25, 0.25, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // ── Knowledge search query progressive type ──────────────────────────────
  const queryText = "what is the walrus cost model?";
  const typed = Math.max(
    0,
    Math.min(queryText.length, Math.floor((frame - TYPE_START) * 1.4)),
  );
  const query = queryText.slice(0, typed);

  // ── Active nav indicator: buckets → knowledge AFTER click ────────────────
  const activeNav: "buckets" | "knowledge" =
    frame >= SWITCH_TO_KNOWLEDGE ? "knowledge" : "buckets";

  // ── Hover states for tables ──────────────────────────────────────────────
  const bucketHoverIndex =
    frame >= HOVER_BUCKET && frame < SWITCH_TO_FILES - 4 ? 1 : undefined;
  const fileHoverIndex =
    frame >= HOVER_FILE && frame < CLICK_FILE + 14 ? 1 : undefined;

  // ── Onchain expansion ────────────────────────────────────────────────────
  const onChainExpanded = frame >= ONCHAIN_EXPAND;

  // Center the dashboard in the 1920×1080 frame
  const dashLeft = (1920 - 1760) / 2;
  const dashTop = (1080 - 980) / 2;

  return (
    <AbsoluteFill style={{ background: color.stone[100], padding: 0 }}>
      <div
        style={{
          position: "absolute",
          left: dashLeft,
          top: dashTop,
          width: 1760,
          height: 980,
        }}
      >
        <DashboardShell
          activeNav={activeNav}
          bucketName={frame >= SWITCH_TO_FILES ? "research-notes" : undefined}
        >
          {/* The content area cross-fades between three views */}
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            {/* Bucket list */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                opacity: bucketListOpacity,
                pointerEvents: "none",
              }}
            >
              <BucketsList rows={BUCKETS} hoverIndex={bucketHoverIndex} />
            </div>

            {/* File browser */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                opacity: fileBrowserOpacity,
                pointerEvents: "none",
              }}
            >
              <FileList
                files={FILES}
                hoverIndex={fileHoverIndex}
                frame={frame}
              />
            </div>

            {/* Knowledge search */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                opacity: knowledgeOpacity,
                pointerEvents: "none",
              }}
            >
              <KnowledgeSearch query={query} showResults={frame >= RESULTS_SHOW} />
            </div>
          </div>
        </DashboardShell>

        {/* Background dim overlay (RENDERED FIRST so drawer paints on top) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: color.ink,
            opacity: dimOpacity,
            pointerEvents: "none",
          }}
        />

        {/* Inspector drawer — overlays the dashboard + dim from the right edge */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 480,
            height: 980,
            transform: `translateX(${drawerX}px)`,
            willChange: "transform",
            boxSizing: "border-box",
          }}
        >
          <InspectorDrawer
            fileName="walrus-cost-model.md"
            size="6.8 kB"
            modified="5d ago"
            bucket="research-notes/"
            owner="0x71a4…3f9c"
            objectId="0x4e2c…0b81"
            expanded={onChainExpanded}
          />
        </div>
      </div>

      {/* The cursor — drives the entire scene */}
      <AnimatedCursor
        waypoints={[
          // Enter off-screen top-right
          { frame: CURSOR_ENTERS, pos: { x: 1700, y: 200 } },
          // Hover bucket row (`research-notes/`)
          { frame: HOVER_BUCKET,  pos: { x: dashLeft + 380, y: dashTop + 220 } },
          // Click bucket
          { frame: CLICK_BUCKET,  pos: { x: dashLeft + 380, y: dashTop + 220 }, click: true, holdBeforeClick: 6 },
          // Hover a file
          { frame: HOVER_FILE,    pos: { x: dashLeft + 500, y: dashTop + 280 } },
          // Click file
          { frame: CLICK_FILE,    pos: { x: dashLeft + 500, y: dashTop + 280 }, click: true, holdBeforeClick: 6 },
          // Move to On-chain header inside the inspector
          { frame: HOVER_ONCHAIN, pos: { x: dashLeft + 1500, y: dashTop + 480 } },
          // Click On-chain
          { frame: CLICK_ONCHAIN, pos: { x: dashLeft + 1500, y: dashTop + 480 }, click: true, holdBeforeClick: 6 },
          // Move to Knowledge nav in sidebar
          { frame: HOVER_KNOWLEDGE_NAV, pos: { x: dashLeft + 120, y: dashTop + 270 } },
          // Click Knowledge nav
          { frame: CLICK_KNOWLEDGE_NAV, pos: { x: dashLeft + 120, y: dashTop + 270 }, click: true, holdBeforeClick: 6 },
          // Move to search input
          { frame: HOVER_INPUT,   pos: { x: dashLeft + 700, y: dashTop + 140 } },
          // Cursor hovers while query types out (no click)
          { frame: HOVER_ASK,     pos: { x: dashLeft + 1500, y: dashTop + 140 } },
          // Click Ask
          { frame: CLICK_ASK,     pos: { x: dashLeft + 1500, y: dashTop + 140 }, click: true, holdBeforeClick: 6 },
        ]}
        holdAfter={60}
      />
    </AbsoluteFill>
  );
};
