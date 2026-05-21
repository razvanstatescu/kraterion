import React from "react";

/**
 * Tiny inline SVG icon set. We deliberately avoid emojis (📁 📄 ⌕) — they
 * render with platform-specific colour glyphs that fight the brutalist
 * type and undermine the engineered feel. These are stroked outlines that
 * inherit `color` via `currentColor`.
 */

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export const FolderIcon: React.FC<IconProps> = ({
  size = 14,
  color: c = "currentColor",
  strokeWidth = 1.5,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke={c}
    strokeWidth={strokeWidth}
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <path d="M2 4 H6 L7.5 5.5 H14 V12.5 H2 Z" />
  </svg>
);

export const FileIcon: React.FC<IconProps> = ({
  size = 14,
  color: c = "currentColor",
  strokeWidth = 1.5,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke={c}
    strokeWidth={strokeWidth}
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <path d="M3 2 H10 L13 5 V14 H3 Z" />
    <path d="M10 2 V5 H13" />
  </svg>
);

export const SearchIcon: React.FC<IconProps> = ({
  size = 14,
  color: c = "currentColor",
  strokeWidth = 1.5,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke={c}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    style={{ flexShrink: 0 }}
  >
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 L13.5 13.5" />
  </svg>
);
