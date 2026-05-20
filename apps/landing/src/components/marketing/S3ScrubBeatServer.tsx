import { highlight } from "@/lib/shiki";
import { S3ScrubBeat } from "./S3ScrubBeat";

export type S3Tab = { lang: string; filename: string; code: string };

export async function S3ScrubBeatServer({ tabs }: { tabs: S3Tab[] }) {
  const highlighted = await Promise.all(
    tabs.map(async (t) => ({ ...t, html: await highlight(t.code, t.lang) }))
  );
  return <S3ScrubBeat tabs={highlighted} />;
}
