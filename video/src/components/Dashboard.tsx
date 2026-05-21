import React from "react";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { space, radius } from "../tokens/spacing";
import { FolderIcon, FileIcon, SearchIcon } from "./Icon";

/**
 * Lightweight recreations of apps/dashboard's key surfaces, restyled for
 * VIDEO scale (denser type, bigger touch targets at 1920×1080). Hairline
 * borders only, brand palette, sentence case.
 *
 *   - DashboardShell — sidebar + topbar + content area
 *   - BucketsList    — 6-column table
 *   - FileList       — file rows with status pulse dots
 *   - InspectorDrawer — 480 px right drawer with stat-row grid
 *   - OwnershipDisclosure — collapsible on-chain proof card
 *   - KnowledgeSearch — search input + result hit list
 *
 * All components are STATELESS — animation comes from passing props
 * (hoverIndex, expanded, queryProgress, etc.) that the parent computes
 * from useCurrentFrame.
 */

// ─── DashboardShell ────────────────────────────────────────────────────────

export const DashboardShell: React.FC<{
  activeNav?: "buckets" | "knowledge" | "agents" | "usage";
  bucketName?: string;
  children: React.ReactNode;
}> = ({ activeNav = "buckets", bucketName, children }) => (
  <div
    style={{
      width: 1760,
      height: 980,
      background: color.cream,
      border: `1px solid ${color.border}`,
      borderRadius: radius.window,
      overflow: "hidden",
      display: "grid",
      gridTemplateColumns: "260px 1fr",
      fontFamily: fonts.sans,
      color: color.ink,
    }}
  >
    <Sidebar activeNav={activeNav} />
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Topbar bucketName={bucketName} />
      <div style={{ flex: 1, padding: `${space[6]}px ${space[8]}px`, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  </div>
);

const Sidebar: React.FC<{ activeNav: string }> = ({ activeNav }) => (
  <div
    style={{
      borderRight: `1px solid ${color.border}`,
      display: "flex",
      flexDirection: "column",
      padding: space[6],
      gap: space[6],
    }}
  >
    {/* Brand */}
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width={20} height={20} viewBox="0 0 20 20">
        <circle cx={10} cy={10} r={8} fill="none" stroke={color.stone[500]} strokeWidth={1.5} />
        <circle cx={10} cy={10} r={5} fill="none" stroke={color.stone[700]} strokeWidth={1.5} />
        <circle cx={10} cy={10} r={1.8} fill={color.stone[900]} />
      </svg>
      <span style={{ fontSize: fs.body, fontWeight: weight.medium, letterSpacing: tracking.heading }}>
        Kraterion
      </span>
    </div>

    {/* Nav groups */}
    <NavGroup label="Storage">
      <NavItem icon="folder" label="Buckets"   active={activeNav === "buckets"} />
      <NavItem icon="search" label="Knowledge" active={activeNav === "knowledge"} />
    </NavGroup>
    <NavGroup label="AI">
      <NavItem icon="folder" label="Agents"    active={activeNav === "agents"} />
    </NavGroup>
    <NavGroup label="Account">
      <NavItem icon="folder" label="Usage"     active={activeNav === "usage"} />
    </NavGroup>

    {/* Account footer */}
    <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          background: color.stone[300],
          color: color.ink,
          fontSize: fs.micro,
          fontWeight: weight.medium,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        RS
      </span>
      <span style={{ fontSize: fs.small, color: color.stone[600] }}>razvan@nano-soft.ro</span>
    </div>
  </div>
);

const NavGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div
      style={{
        fontSize: fs.micro,
        fontWeight: weight.medium,
        color: color.stone[500],
        letterSpacing: tracking.caps,
        textTransform: "uppercase",
        padding: `0 ${space[3]}px ${space[2]}px`,
      }}
    >
      {label}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{children}</div>
  </div>
);

const NavItem: React.FC<{ icon: "folder" | "search"; label: string; active?: boolean }> = ({
  icon,
  label,
  active,
}) => (
  <div
    style={{
      position: "relative",
      display: "flex",
      alignItems: "center",
      gap: space[3],
      padding: `8px ${space[3]}px`,
      borderRadius: radius.chip,
      background: active ? color.stone[50] : "transparent",
      color: active ? color.ink : color.stone[600],
      fontSize: fs.small,
      fontWeight: weight.regular,
    }}
  >
    {active && (
      <span
        style={{
          position: "absolute",
          left: -space[6],
          top: 6,
          bottom: 6,
          width: 2,
          background: color.krater,
        }}
      />
    )}
    {icon === "folder" ? <FolderIcon size={14} color={color.stone[600]} /> : <SearchIcon size={14} color={color.stone[600]} />}
    {label}
  </div>
);

const Topbar: React.FC<{ bucketName?: string }> = ({ bucketName }) => (
  <div
    style={{
      height: 56,
      display: "flex",
      alignItems: "center",
      padding: `0 ${space[8]}px`,
      borderBottom: `1px solid ${color.border}`,
      gap: space[3],
    }}
  >
    <span
      style={{
        fontFamily: fonts.mono,
        fontSize: fs.small,
        color: color.stone[500],
      }}
    >
      app.kraterion.com
    </span>
    <span style={{ color: color.stone[400] }}>/</span>
    <span style={{ fontFamily: fonts.mono, fontSize: fs.small, color: color.ink }}>buckets</span>
    {bucketName && (
      <>
        <span style={{ color: color.stone[400] }}>/</span>
        <span style={{ fontFamily: fonts.mono, fontSize: fs.small, color: color.ink }}>{bucketName}</span>
      </>
    )}
  </div>
);

// ─── BucketsList ───────────────────────────────────────────────────────────

export type BucketRowData = {
  name: string;
  objects: string;
  size: string;
  access: "Granted" | "Revoked";
  visibility: "Private" | "Public";
  created: string;
  knowledge?: boolean;
};

export const BucketsList: React.FC<{
  rows: BucketRowData[];
  hoverIndex?: number;
}> = ({ rows, hoverIndex }) => (
  <div
    style={{
      border: `1px solid ${color.border}`,
      borderRadius: radius.card,
      overflow: "hidden",
      background: color.cream,
    }}
  >
    {/* Header */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
        gap: space[3],
        padding: `${space[3]}px ${space[6]}px`,
        background: color.stone[50],
        borderBottom: `1px solid ${color.border}`,
        fontSize: fs.micro,
        fontWeight: weight.medium,
        color: color.stone[600],
        textTransform: "uppercase",
        letterSpacing: tracking.caps,
      }}
    >
      <span>Name</span>
      <span>Visibility</span>
      <span>Objects</span>
      <span>Storage</span>
      <span>Created</span>
    </div>
    {/* Rows */}
    {rows.map((row, i) => {
      const hover = i === hoverIndex;
      return (
        <div
          key={row.name}
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
            gap: space[3],
            padding: `${space[3]}px ${space[6]}px`,
            background: hover ? color.stone[50] : color.cream,
            borderBottom: i < rows.length - 1 ? `1px solid ${color.border}` : "none",
            alignItems: "center",
            fontSize: fs.small,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: space[3], minWidth: 0 }}>
            <FolderIcon size={16} color={color.stone[600]} />
            <span style={{ fontFamily: fonts.mono, color: color.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.name}
            </span>
            {row.knowledge && (
              <span
                style={{
                  fontSize: fs.micro,
                  fontWeight: weight.medium,
                  color: color.krater,
                  border: `1px solid ${color.krater}`,
                  borderRadius: 999,
                  padding: "1px 8px",
                  letterSpacing: tracking.caps,
                  textTransform: "uppercase",
                  flexShrink: 0,
                }}
              >
                Knowledge
              </span>
            )}
          </div>
          <span style={{ color: color.stone[600], fontFamily: fonts.mono }}>{row.visibility}</span>
          <span style={{ color: color.stone[600], fontFamily: fonts.mono, fontVariantNumeric: "tabular-nums" }}>{row.objects}</span>
          <span style={{ color: color.stone[600], fontFamily: fonts.mono, fontVariantNumeric: "tabular-nums" }}>{row.size}</span>
          <span style={{ color: color.stone[500] }}>{row.created}</span>
        </div>
      );
    })}
  </div>
);

// ─── FileList ──────────────────────────────────────────────────────────────

export type FileRowData = {
  name: string;
  size: string;
  modified: string;
  status: "indexed" | "sealed" | "encrypting" | "uploading";
};

export const FileList: React.FC<{
  files: FileRowData[];
  hoverIndex?: number;
  /** Frame for pulse animation on "uploading"/"encrypting" status dots. */
  frame?: number;
}> = ({ files, hoverIndex, frame = 0 }) => {
  const dotColorMap: Record<FileRowData["status"], string> = {
    indexed:    color.success,
    sealed:     color.success,
    encrypting: color.warning,
    uploading:  color.info,
  };
  return (
    <div
      style={{
        border: `1px solid ${color.border}`,
        borderRadius: radius.card,
        overflow: "hidden",
        background: color.cream,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "3fr 1fr 1fr 1fr",
          gap: space[3],
          padding: `${space[3]}px ${space[6]}px`,
          background: color.stone[50],
          borderBottom: `1px solid ${color.border}`,
          fontSize: fs.micro,
          fontWeight: weight.medium,
          color: color.stone[600],
          textTransform: "uppercase",
          letterSpacing: tracking.caps,
        }}
      >
        <span>Name</span>
        <span style={{ textAlign: "right" }}>Size</span>
        <span style={{ textAlign: "right" }}>Modified</span>
        <span style={{ textAlign: "right" }}>Status</span>
      </div>
      {files.map((f, i) => {
        const hover = i === hoverIndex;
        const pulse = (f.status === "uploading" || f.status === "encrypting")
          ? 0.5 + 0.5 * Math.sin(frame * 0.18)
          : 1;
        return (
          <div
            key={f.name}
            style={{
              display: "grid",
              gridTemplateColumns: "3fr 1fr 1fr 1fr",
              gap: space[3],
              padding: `${space[3]}px ${space[6]}px`,
              background: hover ? color.stone[50] : color.cream,
              borderBottom: i < files.length - 1 ? `1px solid ${color.border}` : "none",
              alignItems: "center",
              fontSize: fs.small,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: space[3], minWidth: 0 }}>
              <FileIcon size={16} color={color.stone[500]} />
              <span style={{ fontFamily: fonts.mono, color: color.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.name}
              </span>
            </div>
            <span style={{ textAlign: "right", color: color.stone[600], fontFamily: fonts.mono, fontVariantNumeric: "tabular-nums" }}>
              {f.size}
            </span>
            <span style={{ textAlign: "right", color: color.stone[500] }}>{f.modified}</span>
            <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: dotColorMap[f.status],
                  opacity: pulse,
                }}
              />
              <span style={{ fontSize: fs.small, color: color.stone[600], textTransform: "capitalize" }}>
                {f.status}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── InspectorDrawer ───────────────────────────────────────────────────────

export const InspectorDrawer: React.FC<{
  fileName: string;
  size: string;
  modified: string;
  bucket: string;
  /** Truncated owner address. */
  owner: string;
  /** Truncated object id. */
  objectId: string;
  /** Expanded state for the ownership disclosure. */
  expanded?: boolean;
}> = ({ fileName, size, modified, bucket, owner, objectId, expanded }) => (
  <div
    style={{
      width: 480,
      height: "100%",
      background: color.cream,
      borderLeft: `1px solid ${color.border}`,
      display: "flex",
      flexDirection: "column",
      fontFamily: fonts.sans,
    }}
  >
    {/* Header */}
    <div
      style={{
        padding: `${space[4]}px ${space[6]}px`,
        borderBottom: `1px solid ${color.border}`,
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: fs.body,
          color: color.ink,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {fileName}
      </div>
      <div style={{ fontSize: fs.small, color: color.stone[500], marginTop: 4 }}>
        in {bucket}
      </div>
    </div>

    {/* Stat rows */}
    <div style={{ padding: `${space[4]}px ${space[6]}px`, display: "flex", flexDirection: "column", gap: space[3] }}>
      <StatRow label="Size"     value={size} />
      <StatRow label="Modified" value={modified} />
      <StatRow label="Bucket"   value={bucket} />
    </div>

    {/* Action buttons */}
    <div style={{ padding: `${space[3]}px ${space[6]}px`, display: "flex", gap: space[2] }}>
      <Btn>Get URL</Btn>
      <Btn>Download</Btn>
    </div>

    {/* On-chain disclosure */}
    <div
      style={{
        margin: `${space[4]}px ${space[6]}px 0`,
        border: `1px solid ${expanded ? color.borderStrong : color.border}`,
        borderRadius: radius.card,
        background: color.stone[50],
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: `${space[3]}px ${space[4]}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: fs.micro,
          fontWeight: weight.medium,
          color: color.stone[600],
          letterSpacing: tracking.caps,
          textTransform: "uppercase",
        }}
      >
        <span>On-chain</span>
        <span style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "none" }}>›</span>
      </div>
      {expanded && (
        <div
          style={{
            padding: `0 ${space[4]}px ${space[4]}px`,
            display: "grid",
            gridTemplateColumns: "120px 1fr",
            rowGap: space[2],
            columnGap: space[3],
            fontSize: fs.small,
          }}
        >
          <span style={{ color: color.stone[500] }}>Owner</span>
          <span style={{ fontFamily: fonts.mono, color: color.ink }}>
            {owner}{" "}
            <span style={{ color: color.krater, fontSize: fs.micro, fontWeight: weight.medium, marginLeft: 4 }}>
              (you)
            </span>
          </span>
          <span style={{ color: color.stone[500] }}>Object id</span>
          <span style={{ fontFamily: fonts.mono, color: color.ink }}>{objectId}</span>
          <span style={{ color: color.stone[500] }}>Access</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <AccessPill label="gateway"  granted />
            <AccessPill label="indexer"  granted />
          </div>
        </div>
      )}
    </div>
  </div>
);

const StatRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "baseline" }}>
    <span
      style={{
        fontSize: fs.micro,
        fontWeight: weight.medium,
        color: color.stone[500],
        textTransform: "uppercase",
        letterSpacing: tracking.caps,
      }}
    >
      {label}
    </span>
    <span style={{ fontFamily: fonts.mono, fontSize: fs.small, color: color.ink }}>{value}</span>
  </div>
);

const Btn: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      flex: 1,
      padding: `${space[2]}px ${space[3]}px`,
      border: `1px solid ${color.border}`,
      borderRadius: radius.chip,
      background: color.cream,
      fontSize: fs.small,
      color: color.ink,
      textAlign: "center",
    }}
  >
    {children}
  </span>
);

const AccessPill: React.FC<{ label: string; granted?: boolean }> = ({ label, granted }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "2px 8px",
      borderRadius: 999,
      border: `1px solid ${color.border}`,
      background: color.cream,
      fontSize: fs.micro,
      color: color.stone[600],
      fontFamily: fonts.mono,
    }}
  >
    <span
      style={{
        width: 5,
        height: 5,
        borderRadius: 999,
        background: granted ? color.success : color.error,
      }}
    />
    {label}
  </span>
);

// ─── KnowledgeSearch ───────────────────────────────────────────────────────

export const KnowledgeSearch: React.FC<{
  /** Query text rendered into the input (animate progressively to "type"). */
  query: string;
  /** Show result hits (after a delay). */
  showResults?: boolean;
}> = ({ query, showResults }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: space[4],
      width: "100%",
    }}
  >
    {/* Search form */}
    <div
      style={{
        display: "flex",
        gap: space[2],
        padding: space[3],
        background: color.stone[50],
        border: `1px solid ${color.border}`,
        borderRadius: radius.card,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: space[3],
          padding: `${space[2]}px ${space[3]}px`,
          background: color.cream,
          border: `1px solid ${color.border}`,
          borderRadius: radius.chip,
        }}
      >
        <SearchIcon size={14} color={color.stone[500]} />
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: fs.body,
            color: color.ink,
          }}
        >
          {query}
          <span
            style={{
              display: "inline-block",
              width: 2,
              height: fs.body,
              background: color.krater,
              marginLeft: 2,
              verticalAlign: "middle",
            }}
          />
        </span>
      </div>
      <span
        style={{
          padding: `${space[2]}px ${space[4]}px`,
          background: color.ink,
          color: color.cream,
          fontSize: fs.small,
          fontWeight: weight.medium,
          borderRadius: radius.chip,
        }}
      >
        Ask
      </span>
    </div>

    {/* Results */}
    {showResults && (
      <div style={{ display: "flex", flexDirection: "column", gap: space[3] }}>
        {[
          { src: "walrus-cost-model.md",   line: "Walrus shards cut storage cost ~40% vs S3.",            score: 0.94 },
          { src: "seal-envelope-flow.md",  line: "Seal encrypts before upload — platform never sees plaintext.", score: 0.89 },
          { src: "2026-overflow-thesis.md", line: "Knowledge index auto-updates as new objects land.",     score: 0.81 },
        ].map((hit) => (
          <div
            key={hit.src}
            style={{
              padding: `${space[3]}px ${space[4]}px`,
              border: `1px solid ${color.border}`,
              borderRadius: radius.card,
              background: color.cream,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 6,
              }}
            >
              <span style={{ fontFamily: fonts.mono, fontSize: fs.micro, color: color.stone[500] }}>
                {hit.src}
              </span>
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: fs.micro,
                  color: color.stone[500],
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {hit.score.toFixed(2)}
              </span>
            </div>
            <div style={{ fontSize: fs.small, color: color.ink, lineHeight: 1.5 }}>{hit.line}</div>
          </div>
        ))}
      </div>
    )}
  </div>
);
