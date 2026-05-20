import { CodeBlock } from "@/components/ui/CodeBlock";

const SNIPPET = `<script src="https://embed.kraterion.com/v1.js"
        data-token="pk_share_..."
        defer></script>`;

export function EmbedSnippet() {
  return (
    <CodeBlock
      tabs={[{ lang: "html", filename: "index.html", code: SNIPPET }]}
    />
  );
}
