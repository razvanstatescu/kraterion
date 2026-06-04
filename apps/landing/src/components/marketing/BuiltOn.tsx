import { cn } from "@/lib/cn";
import { BrandLogo, BRAND_URL, type Brand } from "./BrandLogo";

/**
 * BuiltOn — a quiet one-line trust strip for the hero: what Kraterion runs on.
 *   stored on [Walrus] · secured by [Seal] · owned on [Sui]
 *
 * Logos render in their own colors (light background). For dark surfaces, use
 * BrandLogo with tone="mono" directly (see the footer).
 */

const ITEMS: { label: string; brand: Brand; h: number }[] = [
  { label: "Stored on", brand: "walrus", h: 14 },
  { label: "Secured by", brand: "seal", h: 13 },
  { label: "Owned on", brand: "sui", h: 18 },
];

export function BuiltOn({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-3 text-[13px] text-stone-500",
        className
      )}
    >
      {ITEMS.map((item, i) => (
        <div key={item.brand} className="flex items-center gap-x-5">
          {i > 0 && <span aria-hidden className="h-3 w-px bg-stone-300" />}
          <span className="flex items-center gap-2">
            {item.label}
            <a
              href={BRAND_URL[item.brand]}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex transition-opacity hover:opacity-70"
            >
              <BrandLogo brand={item.brand} h={item.h} className="text-stone-600" />
            </a>
          </span>
        </div>
      ))}
    </div>
  );
}
