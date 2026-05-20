import { createHighlighter, type Highlighter } from "shiki";

let highlighter: Promise<Highlighter> | null = null;

export function getHighlighter() {
  if (!highlighter) {
    highlighter = createHighlighter({
      themes: ["github-light"],
      langs: ["bash", "python", "typescript", "javascript", "json", "html"],
    });
  }
  return highlighter;
}

// Recolor github-light to the warm palette by overriding token colors.
// We post-process the HTML to replace specific hex codes.
const RECOLOR: Array<[RegExp, string]> = [
  // background and default foreground
  [/#fff(?![0-9a-f])/gi, "#F8F4EC"],
  [/#ffffff/gi, "#F8F4EC"],
  [/#24292e/gi, "#1A1610"],
  [/#1f2328/gi, "#1A1610"],
  // strings (greens) → olive success
  [/#0a3069/gi, "#3B6F73"],
  [/#032f62/gi, "#3B6F73"],
  [/#0550ae/gi, "#3B6F73"],
  // keywords (reds/purples) → krater
  [/#d73a49/gi, "#C45B36"],
  [/#cf222e/gi, "#C45B36"],
  [/#8250df/gi, "#C45B36"],
  // functions and variables (blues) → ink-ish
  [/#6f42c1/gi, "#5B5142"],
  [/#005cc5/gi, "#3B6F73"],
  [/#953800/gi, "#5C7A3F"],
  // comments
  [/#6a737d/gi, "#7C7158"],
  [/#6e7781/gi, "#7C7158"],
];

export async function highlight(code: string, lang: string) {
  const h = await getHighlighter();
  let html = h.codeToHtml(code, { lang, theme: "github-light" });
  for (const [re, color] of RECOLOR) {
    html = html.replace(re, color);
  }
  return html;
}
