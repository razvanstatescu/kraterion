import { redirect } from "next/navigation";

export const dynamic = "force-static";

// Lineage merged into the Replay & audit page — they are two views of the same
// run record. Keep the URL alive so existing links don't break.
export default function Page() {
  redirect("/runs#lineage");
}
