"use client";

import { Children, isValidElement, type ReactNode } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import type { AgentCitationJson } from "@/lib/api";

/**
 * Streamdown-backed markdown renderer for assistant turns.
 *
 * Why streamdown vs. a hand-roll or stock react-markdown:
 *   - Built by Vercel for AI-SDK 5 streaming output. Handles
 *     incomplete fenced code blocks (``` opened, not yet closed
 *     mid-stream) — they render as code, not as a broken paragraph
 *     until the closing fence arrives.
 *   - GFM features (tables, task lists, strikethrough, autolinks)
 *     come for free.
 *   - No `dangerouslySetInnerHTML`; default `linkSafety` rejects
 *     `javascript:` URLs and the like.
 *
 * Our integration:
 *   1. Every text-bearing component override (`p`, `li`, `h1-h6`,
 *      `strong`, `em`, `td`, `th`) routes children through
 *      `splitChunkMarkers`, which scans string children for
 *      `[chunk N]` and emits the React `CitationBadge` in place.
 *   2. The class names match the existing `.ks-md-*` rules in
 *      `globals.css` so the look stays consistent with the rest
 *      of the dashboard.
 *
 * Citation badges inside code spans / code blocks are intentionally
 * left literal — pasting `[chunk 1]` into a code example shouldn't
 * silently get hyperlinked.
 */

export interface MarkdownRenderContext {
  citationByIndex: Map<number, AgentCitationJson>;
  /** Resolves a citation `index` to the DOM id of the source row. */
  sourceDomId: (index: number) => string;
  /** DOM id of the collapsible Sources panel (force-open before scroll). */
  panelDomId: string;
  /** React component for `[chunk N]` markers — passed in so the chat
   *  panel can keep ownership of styling + scroll behavior. */
  CitationBadge: (props: {
    n: number;
    targetId: string;
    panelId: string;
  }) => ReactNode;
}

export function renderMarkdown(
  source: string,
  ctx: MarkdownRenderContext,
): ReactNode {
  // We only need a handful of overrides; everything else streamdown
  // renders fine with its defaults.
  const withMarkers = (children: ReactNode) =>
    splitChunkMarkers(children, ctx);
  return (
    <Streamdown
      parseIncompleteMarkdown
      components={{
        p: ({ children }) => <p className="ks-md-p">{withMarkers(children)}</p>,
        h1: ({ children }) => <h3 className="ks-md-h">{withMarkers(children)}</h3>,
        h2: ({ children }) => <h4 className="ks-md-h">{withMarkers(children)}</h4>,
        h3: ({ children }) => <h5 className="ks-md-h">{withMarkers(children)}</h5>,
        h4: ({ children }) => <h6 className="ks-md-h">{withMarkers(children)}</h6>,
        h5: ({ children }) => <h6 className="ks-md-h">{withMarkers(children)}</h6>,
        h6: ({ children }) => <h6 className="ks-md-h">{withMarkers(children)}</h6>,
        ul: ({ children }) => <ul className="ks-md-ul">{children}</ul>,
        ol: ({ children }) => <ol className="ks-md-ol">{children}</ol>,
        li: ({ children }) => <li className="ks-md-li">{withMarkers(children)}</li>,
        strong: ({ children }) => <strong>{withMarkers(children)}</strong>,
        em: ({ children }) => <em>{withMarkers(children)}</em>,
        td: ({ children }) => <td className="ks-md-td">{withMarkers(children)}</td>,
        th: ({ children }) => <th className="ks-md-th">{withMarkers(children)}</th>,
        code: ({ className, children }) => (
          // Inline code spans don't get a className from streamdown;
          // fenced code blocks do (`language-foo`). Use that to keep
          // our small inline styling off the bigger block.
          className ? (
            <code className={className}>{children}</code>
          ) : (
            <code className="ks-md-code">{children}</code>
          )
        ),
        pre: ({ children }) => <pre className="ks-md-pre">{children}</pre>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="ks-md-link"
          >
            {children}
          </a>
        ),
      }}
    >
      {source}
    </Streamdown>
  );
}

/**
 * Walk React children once. Every string child is scanned for
 * `[chunk N]` markers; matching markers are replaced with a
 * `CitationBadge`, the surrounding plain-text fragments stay as
 * strings. Non-string children (elements, fragments) pass through.
 *
 * Recursion is shallow: streamdown gives us already-rendered inline
 * elements (`<strong>`, `<em>`, etc.) and we walk their direct
 * children only. That's enough because the model emits citation
 * markers at the text-flow level, not nested inside other inline
 * styles.
 */
function splitChunkMarkers(
  children: ReactNode,
  ctx: MarkdownRenderContext,
): ReactNode {
  const out: ReactNode[] = [];
  let key = 0;
  const nextKey = () => `m-${key++}`;

  Children.forEach(children, (child) => {
    if (typeof child === "string") {
      pushSplitString(child, ctx, out, nextKey);
      return;
    }
    if (typeof child === "number") {
      out.push(<span key={nextKey()}>{String(child)}</span>);
      return;
    }
    if (isValidElement(child)) {
      out.push(child);
      return;
    }
    if (child === null || child === undefined || typeof child === "boolean") {
      return;
    }
    out.push(child);
  });
  return out;
}

function pushSplitString(
  text: string,
  ctx: MarkdownRenderContext,
  out: ReactNode[],
  nextKey: () => string,
): void {
  const re = /\[chunk\s+(\d+)\]/gi;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) {
      out.push(
        <span key={nextKey()}>{text.slice(cursor, m.index)}</span>,
      );
    }
    const n = Number(m[1]);
    const citation = ctx.citationByIndex.get(n);
    if (citation) {
      out.push(
        <ctx.CitationBadge
          key={nextKey()}
          n={n}
          targetId={ctx.sourceDomId(citation.index)}
          panelId={ctx.panelDomId}
        />,
      );
    }
    // Unresolved markers are dropped — same fallthrough policy as
    // the pre-streamdown renderer.
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) {
    out.push(<span key={nextKey()}>{text.slice(cursor)}</span>);
  }
}
