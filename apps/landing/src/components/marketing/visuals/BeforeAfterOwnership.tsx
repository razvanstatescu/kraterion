import { cn } from "@/lib/cn";

export function BeforeAfterOwnership({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-2",
        className
      )}
    >
      {/* === BEFORE — typical S3 === */}
      <div className="bg-cream p-8 md:p-10">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full border border-stone-200/80 px-3 py-1 text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-stone-400" />
            Typical S3
          </span>
          <span className="font-mono text-[11px] text-stone-500">01 · before</span>
        </div>

        <h3 className="mt-6 text-[24px] leading-[1.2] text-ink">
          They hold the keys.
        </h3>

        <BeforeIllustration />

        <ul className="mt-8 space-y-2.5 text-[13px] text-stone-700">
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-stone-400" />
            Keys live inside the provider boundary.
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-stone-400" />
            Revoke is a support ticket, not a property.
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-stone-400" />
            Exit means copying everything out — and paying egress.
          </li>
        </ul>
      </div>

      {/* === AFTER — Kraterion === */}
      <div className="bg-cream p-8 md:p-10">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full border border-krater/30 bg-krater/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.16em] font-medium text-krater">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-krater" />
            Kraterion
          </span>
          <span className="font-mono text-[11px] text-stone-500">02 · after</span>
        </div>

        <h3 className="mt-6 text-[24px] leading-[1.2] text-ink">
          You hold the keys.
        </h3>

        <AfterIllustration />

        <ul className="mt-8 space-y-2.5 text-[13px] text-stone-700">
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-krater" />
            Keys live with you. Plaintext never crosses the wire.
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-krater" />
            Revoke is a policy property — enforced, not promised.
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-krater" />
            Exit means using your existing S3 clients. No egress fee.
          </li>
        </ul>
      </div>
    </div>
  );
}

/* =====================================================================
   Illustration — BEFORE
   - 2 stroke weights (1.5px primary, 1px dashed secondary)
   - Corner registration ticks at viewBox edges
   - Layered nested boxes
   - Callout label with hairline underline and leader line
   - One color: ink + stone, no accent (the provider owns everything)
===================================================================== */
function BeforeIllustration() {
  return (
    <svg
      viewBox="0 0 480 280"
      className="mt-8 block w-full"
      aria-hidden
      fontFamily="ui-monospace, SFMono-Regular, monospace"
    >
      <RegTicks />

      {/* Outer provider perimeter */}
      <rect
        x="80"
        y="40"
        width="360"
        height="200"
        rx="10"
        fill="none"
        stroke="#7C7158"
        strokeWidth="1.5"
      />
      {/* Perimeter label band */}
      <rect x="80" y="40" width="360" height="22" fill="#F1ECE0" stroke="none" />
      <line x1="80" y1="62" x2="440" y2="62" stroke="#7C7158" strokeWidth="1" />
      <text x="92" y="56" fontSize="10" fill="#5B5142" letterSpacing="1">
        provider.s3 · us-east-1
      </text>
      <text x="425" y="56" fontSize="10" fill="#A89C82" textAnchor="end">
        ●●●
      </text>

      {/* Inner sub-region (dashed) */}
      <rect
        x="104"
        y="84"
        width="312"
        height="136"
        rx="6"
        fill="none"
        stroke="#A89C82"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      <text x="116" y="100" fontSize="9" fill="#7C7158">
        kms · provider-managed
      </text>

      {/* File node */}
      <g transform="translate(160, 124)">
        <rect x="0" y="0" width="56" height="68" rx="3" fill="#FAF7EF" stroke="#5B5142" strokeWidth="1" />
        <polygon points="42,0 56,0 56,14" fill="#E1D9C7" stroke="#5B5142" strokeWidth="1" />
        <line x1="8" y1="26" x2="48" y2="26" stroke="#7C7158" strokeWidth="1" />
        <line x1="8" y1="34" x2="48" y2="34" stroke="#7C7158" strokeWidth="1" />
        <line x1="8" y1="42" x2="48" y2="42" stroke="#7C7158" strokeWidth="1" />
        <line x1="8" y1="50" x2="34" y2="50" stroke="#7C7158" strokeWidth="1" />
        <text x="28" y="62" fontSize="8" fill="#7C7158" textAnchor="middle">
          photo.jpg
        </text>
      </g>

      {/* Key node */}
      <g transform="translate(280, 150)">
        <rect x="-32" y="-22" width="64" height="44" rx="6" fill="#F1ECE0" stroke="#5B5142" strokeWidth="1" />
        <circle cx="-12" cy="0" r="6" fill="none" stroke="#5B5142" strokeWidth="1.5" />
        <line x1="-6" y1="0" x2="14" y2="0" stroke="#5B5142" strokeWidth="1.5" />
        <line x1="8" y1="0" x2="8" y2="5" stroke="#5B5142" strokeWidth="1.5" />
        <text x="0" y="16" fontSize="8" fill="#5B5142" textAnchor="middle">
          key
        </text>
      </g>

      {/* Connector: file → key (dashed) */}
      <path d="M218,158 L248,158" fill="none" stroke="#A89C82" strokeWidth="1" strokeDasharray="3 3" />

      {/* "You" puck OUTSIDE the perimeter */}
      <g transform="translate(30, 240)">
        <circle cx="0" cy="0" r="14" fill="#FAF7EF" stroke="#7C7158" strokeWidth="1.25" />
        <text x="0" y="3" fontSize="9" fill="#5B5142" textAnchor="middle">
          you
        </text>
      </g>
      {/* Disconnect from perimeter — short broken line */}
      <line x1="46" y1="234" x2="74" y2="220" stroke="#A89C82" strokeWidth="1" strokeDasharray="2 4" />

      {/* Callout — leader line + hairline underline label */}
      <line x1="306" y1="172" x2="386" y2="200" stroke="#7C7158" strokeWidth="0.75" />
      <circle cx="306" cy="172" r="2.5" fill="#7C7158" />
      <line x1="380" y1="208" x2="448" y2="208" stroke="#7C7158" strokeWidth="0.75" />
      <text x="380" y="204" fontSize="9" fill="#5B5142">
        provider-held
      </text>
    </svg>
  );
}

/* =====================================================================
   Illustration — AFTER
   - Same structural grammar
   - One accent color: krater orange on the user-controlled element
   - Same registration ticks, callouts, two stroke weights
===================================================================== */
function AfterIllustration() {
  return (
    <svg
      viewBox="0 0 480 280"
      className="mt-8 block w-full"
      aria-hidden
      fontFamily="ui-monospace, SFMono-Regular, monospace"
    >
      <RegTicks />

      {/* Provider perimeter — still drawn but lighter, no longer the center of gravity */}
      <rect
        x="180"
        y="40"
        width="260"
        height="200"
        rx="10"
        fill="none"
        stroke="#7C7158"
        strokeWidth="1.5"
      />
      <rect x="180" y="40" width="260" height="22" fill="#F1ECE0" stroke="none" />
      <line x1="180" y1="62" x2="440" y2="62" stroke="#7C7158" strokeWidth="1" />
      <text x="192" y="56" fontSize="10" fill="#5B5142" letterSpacing="1">
        kraterion.s3 · multi-region
      </text>
      <text x="425" y="56" fontSize="10" fill="#A89C82" textAnchor="end">
        ●●●
      </text>

      {/* Inner storage zone */}
      <rect
        x="200"
        y="84"
        width="220"
        height="136"
        rx="6"
        fill="none"
        stroke="#A89C82"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      <text x="212" y="100" fontSize="9" fill="#7C7158">
        ciphertext only · n=3f+1
      </text>

      {/* Sealed file node — krater-tinged */}
      <g transform="translate(258, 124)">
        <rect x="0" y="0" width="56" height="68" rx="3" fill="#FAF7EF" stroke="#5B5142" strokeWidth="1" />
        <polygon points="42,0 56,0 56,14" fill="#E1D9C7" stroke="#5B5142" strokeWidth="1" />
        <line x1="8" y1="26" x2="48" y2="26" stroke="#C45B36" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
        <line x1="8" y1="34" x2="48" y2="34" stroke="#C45B36" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
        <line x1="8" y1="42" x2="48" y2="42" stroke="#C45B36" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
        <line x1="8" y1="50" x2="34" y2="50" stroke="#C45B36" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
        {/* Sealed badge overlap */}
        <circle cx="56" cy="0" r="8" fill="#C45B36" />
        <path d="M52,0 L55,3 L60,-3" stroke="#FAF7EF" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="28" y="62" fontSize="8" fill="#7C7158" textAnchor="middle">
          photo.jpg
        </text>
      </g>

      {/* "You" puck — krater-prominent, OUTSIDE the perimeter, holding the key */}
      <g transform="translate(80, 150)">
        <circle cx="0" cy="0" r="36" fill="#FAF7EF" stroke="#C45B36" strokeWidth="1.5" />
        <text x="0" y="-8" fontSize="9" fill="#C45B36" textAnchor="middle" letterSpacing="1">
          YOU
        </text>
        {/* Key inside the puck */}
        <circle cx="-8" cy="6" r="4" fill="none" stroke="#C45B36" strokeWidth="1.5" />
        <line x1="-4" y1="6" x2="10" y2="6" stroke="#C45B36" strokeWidth="1.5" />
        <line x1="6" y1="6" x2="6" y2="10" stroke="#C45B36" strokeWidth="1.5" />
        <text x="0" y="22" fontSize="7" fill="#C45B36" textAnchor="middle">
          holds key
        </text>
      </g>

      {/* Connector: you → file (dashed orange) */}
      <path
        d="M120,150 Q 180,140 256,148"
        fill="none"
        stroke="#C45B36"
        strokeWidth="1.25"
        strokeDasharray="4 4"
      />
      <circle cx="120" cy="150" r="2.5" fill="#C45B36" />
      <circle cx="256" cy="148" r="2.5" fill="#C45B36" />

      {/* Callout */}
      <line x1="314" y1="118" x2="386" y2="80" stroke="#7C7158" strokeWidth="0.75" />
      <circle cx="314" cy="118" r="2.5" fill="#7C7158" />
      <line x1="380" y1="88" x2="448" y2="88" stroke="#7C7158" strokeWidth="0.75" />
      <text x="380" y="84" fontSize="9" fill="#5B5142">
        sealed at rest
      </text>
    </svg>
  );
}

/* Corner registration ticks inside an SVG viewBox */
function RegTicks() {
  const ticks = [
    { x: 4, y: 4, d: "M 0 8 L 0 0 L 8 0" },
    { x: 476, y: 4, d: "M 0 0 L 8 0 L 8 8", t: "translate(468, 4)" },
    { x: 4, y: 276, d: "M 0 0 L 0 8 L 8 8", t: "translate(4, 268)" },
    { x: 476, y: 276, d: "M 0 8 L 8 8 L 8 0", t: "translate(468, 268)" },
  ];
  return (
    <g stroke="#C9BFA8" strokeWidth="0.75" fill="none" opacity="0.7">
      <path d="M 4 12 L 4 4 L 12 4" />
      <path d="M 476 4 L 468 4 L 468 12" />
      <path d="M 4 268 L 4 276 L 12 276" />
      <path d="M 476 276 L 468 276 L 468 268" />
    </g>
  );
}
