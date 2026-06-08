import { FadeUp } from "@/components/motion/FadeUp";

/**
 * LegalPage — shared shell for the private-beta legal pages. Renders a title, a
 * last-updated line, an honest "beta — being finalized" notice, and the page
 * body. Deliberately plain-language and non-binding; full documents are pending
 * legal review.
 */
export function LegalPage({
  title,
  updated,
  summary,
  children,
}: {
  title: string;
  updated: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-[760px] px-6 pt-32 pb-24">
      <FadeUp>
        <p className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Legal
        </p>
        <h1 className="mt-4 text-[40px] leading-[1.05] tracking-[-0.01em] text-ink">
          {title}
        </h1>
        <p className="mt-3 text-[13px] text-stone-500">Last updated {updated}</p>
        <p className="mt-6 text-[18px] leading-[1.6] text-stone-700">{summary}</p>
        <div className="mt-6 border-l-2 border-krater bg-stone-50 px-5 py-4 text-[14px] leading-[1.65] text-stone-700">
          Kraterion is in private beta. This is a plain-language summary while the
          full document is finalized with counsel — it isn&apos;t a binding legal
          agreement. For specifics, current terms, or a signed agreement, write to{" "}
          <a
            href="mailto:legal@kraterion.com"
            className="text-krater underline-offset-2 hover:underline"
          >
            legal@kraterion.com
          </a>
          .
        </div>
      </FadeUp>
      <FadeUp delay={0.05}>
        <div className="mt-12 flex flex-col gap-10">{children}</div>
      </FadeUp>
    </section>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-[22px] leading-[1.2] text-ink">{heading}</h2>
      <div className="mt-3 flex flex-col gap-3 text-[15px] leading-[1.7] text-stone-700">
        {children}
      </div>
    </div>
  );
}
