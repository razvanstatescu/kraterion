import Link from "next/link";
import { Check } from "lucide-react";
import { TIERS } from "@/lib/mock/pricing";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export function PricingTeaser() {
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {TIERS.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex flex-col rounded-lg border p-8",
              t.highlight ? "border-krater/40" : "border-stone-200/60"
            )}
          >
            <h3 className="text-[24px] leading-[1.2]">{t.name}</h3>
            <p className="mt-1 text-[14px] text-stone-600">{t.headline}</p>
            <div className="mt-6 flex items-baseline gap-2">
              <span className="text-[40px] leading-none">{t.price}</span>
              <span className="text-[14px] text-stone-600">{t.period}</span>
            </div>
            <ul className="mt-8 flex flex-1 flex-col gap-3">
              {t.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-[14px] text-stone-700">
                  <Check size={14} strokeWidth={1.75} className="text-stone-500" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <ButtonLink
                href="/signup"
                variant={t.highlight ? "primary" : "secondary"}
                size="md"
                className="w-full"
              >
                {t.cta}
              </ButtonLink>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 flex items-center justify-between rounded-md bg-stone-50 px-6 py-4 text-[14px]">
        <span className="text-stone-700">Cheap egress — 50 GB free, then $0.01/GB. ~9× under AWS, no tier surprises.</span>
        <Link href="/pricing" className="font-medium text-ink underline underline-offset-4 decoration-stone-400 hover:decoration-ink">
          See full pricing →
        </Link>
      </div>
    </div>
  );
}
