import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Docs — Kraterion",
  description: "Reference docs for the Kraterion API, SDKs, knowledge layer, agents, and embed widget.",
};

export default function Page() {
  return (
    <section className="mx-auto max-w-[1080px] px-6 pt-24 pb-24">
      <p className="micro text-stone-500">Docs</p>
      <h1 className="mt-4 text-[48px] leading-[1.05] tracking-[-0.01em]">Docs</h1>
      <p className="mt-6 max-w-[640px] text-[18px] text-stone-700">
        Get from zero to a queryable bucket in under five minutes.
      </p>
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        <Link
          href="/docs/quickstart"
          className="rounded-lg border border-stone-200/60 p-6 hover:bg-stone-50"
        >
          <div className="text-[15px] font-medium">Quickstart</div>
          <div className="mt-2 text-[14px] text-stone-600">
            Install boto3, point it at our endpoint, upload a file.
          </div>
        </Link>
      </div>
    </section>
  );
}
