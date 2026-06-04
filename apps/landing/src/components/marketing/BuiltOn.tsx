import { cn } from "@/lib/cn";

/**
 * BuiltOn — a quiet one-line trust strip for the hero: what Kraterion runs on.
 *   stored on [Walrus] · secured by [Seal] · owned on [Sui]
 *
 * The brand SVGs in /public/brands render in their own colors. Each carries an
 * alt for screen readers.
 */

const ITEMS: { label: string; brand: string; aspect: number; h: number }[] = [
  { label: "Stored on", brand: "walrus", aspect: 1417 / 931, h: 14 },
  { label: "Secured by", brand: "seal", aspect: 284 / 162, h: 13 },
  { label: "Owned on", brand: "sui", aspect: 300 / 384, h: 18 },
];

function BrandMark({
  brand,
  aspect,
  h,
}: {
  brand: string;
  aspect: number;
  h: number;
}) {
  const name = brand.charAt(0).toUpperCase() + brand.slice(1);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/brands/${brand}.svg`}
      alt={name}
      width={Math.round(h * aspect)}
      height={h}
      className="inline-block shrink-0 align-middle"
      style={{ height: h, width: h * aspect }}
    />
  );
}

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
            <BrandMark brand={item.brand} aspect={item.aspect} h={item.h} />
          </span>
        </div>
      ))}
    </div>
  );
}
