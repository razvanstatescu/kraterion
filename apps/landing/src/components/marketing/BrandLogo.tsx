import { cn } from "@/lib/cn";

/**
 * BrandLogo — renders a partner brand mark from /public/brands.
 *
 * tone="color" → the SVG in its own colors via <img> (light backgrounds).
 * tone="mono"  → the SVG as a CSS-mask silhouette in currentColor, so it can be
 *                tinted (e.g. cream/stone) for dark surfaces where the supplied
 *                near-black marks would otherwise vanish.
 *
 * Intrinsic aspect ratios are baked in so callers only pass a height.
 */

export type Brand = "walrus" | "seal" | "sui";

const ASPECT: Record<Brand, number> = {
  walrus: 1417 / 931,
  seal: 284 / 162,
  sui: 300 / 384,
};

/** Official sites for the underlying tech, for "learn more" / logo links. */
export const BRAND_URL: Record<Brand, string> = {
  walrus: "https://www.walrus.xyz/",
  seal: "https://seal.mystenlabs.com/",
  sui: "https://www.sui.io/",
};

export const WALRUS_MEMORY_URL = "https://memwal.ai/";

export function BrandLogo({
  brand,
  h = 14,
  tone = "color",
  className,
}: {
  brand: Brand;
  h?: number;
  tone?: "color" | "mono";
  className?: string;
}) {
  const name = brand.charAt(0).toUpperCase() + brand.slice(1);
  const width = h * ASPECT[brand];

  if (tone === "mono") {
    return (
      <span
        role="img"
        aria-label={name}
        className={cn("inline-block shrink-0 bg-current align-middle", className)}
        style={{
          height: h,
          width,
          WebkitMaskImage: `url(/brands/${brand}.svg)`,
          maskImage: `url(/brands/${brand}.svg)`,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          WebkitMaskSize: "contain",
          maskSize: "contain",
        }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/brands/${brand}.svg`}
      alt={name}
      width={Math.round(width)}
      height={h}
      className={cn("inline-block shrink-0 align-middle", className)}
      style={{ height: h, width }}
    />
  );
}
