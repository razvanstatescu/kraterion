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
      <div className="flex flex-col bg-cream p-8 md:p-10">
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

        <div className="mt-8">
          <BeforeIllustration />
        </div>

        <ul className="mt-auto pt-8 space-y-2.5 text-[13px] text-stone-700">
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
      <div className="flex flex-col bg-cream p-8 md:p-10">
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

        <div className="mt-8">
          <AfterIllustration />
        </div>

        <ul className="mt-auto pt-8 space-y-2.5 text-[13px] text-stone-700">
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
   - Recomposed for clarity: provider perimeter holds file + key.
   - "You" puck sits outside, disconnected — emphasizing inaccessibility.
   - Callout pulled fully inside the viewBox so it never clips edges.
===================================================================== */
function BeforeIllustration() {
  return (
    <svg
      viewBox="0 0 480 240"
      className="block w-full"
      aria-hidden
      fontFamily="ui-monospace, SFMono-Regular, monospace"
    >
      <RegTicks w={480} h={240} />

      {/* Provider perimeter */}
      <rect
        x="124"
        y="32"
        width="324"
        height="176"
        rx="10"
        fill="none"
        stroke="#7C7158"
        strokeWidth="1.5"
      />
      {/* Perimeter title band */}
      <rect x="124" y="32" width="324" height="22" fill="#F1ECE0" />
      <line x1="124" y1="54" x2="448" y2="54" stroke="#7C7158" strokeWidth="1" />
      <text x="136" y="48" fontSize="10" fill="#5B5142" letterSpacing="1">
        provider.s3 · us-east-1
      </text>
      <text x="436" y="48" fontSize="10" fill="#A89C82" textAnchor="end">
        ●●●
      </text>

      {/* Inner kms region (dashed) */}
      <rect
        x="146"
        y="74"
        width="280"
        height="120"
        rx="6"
        fill="none"
        stroke="#A89C82"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      <text x="158" y="90" fontSize="9" fill="#7C7158">
        kms · provider-managed
      </text>

      {/* File node */}
      <g transform="translate(190, 112)">
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

      {/* Connector: file → key */}
      <line x1="246" y1="146" x2="306" y2="146" stroke="#A89C82" strokeWidth="1" strokeDasharray="3 3" />

      {/* Key node */}
      <g transform="translate(338, 146)">
        <rect x="-32" y="-22" width="64" height="44" rx="6" fill="#F1ECE0" stroke="#5B5142" strokeWidth="1" />
        <circle cx="-14" cy="-2" r="6" fill="none" stroke="#5B5142" strokeWidth="1.5" />
        <line x1="-8" y1="-2" x2="14" y2="-2" stroke="#5B5142" strokeWidth="1.5" />
        <line x1="8" y1="-2" x2="8" y2="4" stroke="#5B5142" strokeWidth="1.5" />
        <text x="0" y="16" fontSize="8" fill="#5B5142" textAnchor="middle">
          key
        </text>
      </g>

      {/* "You" puck OUTSIDE the perimeter — vertically centered with the file */}
      <g transform="translate(60, 146)">
        <circle cx="0" cy="0" r="22" fill="#FAF7EF" stroke="#7C7158" strokeWidth="1.25" />
        <text x="0" y="3" fontSize="10" fill="#5B5142" textAnchor="middle" letterSpacing="1">
          you
        </text>
        <text x="0" y="40" fontSize="8" fill="#7C7158" textAnchor="middle">
          no access path
        </text>
      </g>
      {/* Disconnect — short broken line from "you" to provider edge */}
      <line x1="84" y1="146" x2="118" y2="146" stroke="#A89C82" strokeWidth="1" strokeDasharray="2 4" />
      {/* Red-ish lock indicator on the boundary */}
      <g transform="translate(122, 146)">
        <circle cx="0" cy="0" r="4" fill="#FAF7EF" stroke="#7C7158" strokeWidth="1" />
        <line x1="-3" y1="0" x2="3" y2="0" stroke="#7C7158" strokeWidth="1" />
        <line x1="0" y1="-3" x2="0" y2="3" stroke="#7C7158" strokeWidth="1" />
      </g>
    </svg>
  );
}

/* =====================================================================
   Illustration — AFTER
   - User stands clearly outside the platform perimeter, holding the key.
   - File inside is sealed (krater dashed lines + sealed badge).
   - Connector explicitly orange → reads as authority running inward.
===================================================================== */
function AfterIllustration() {
  return (
    <svg
      viewBox="0 0 480 240"
      className="block w-full"
      aria-hidden
      fontFamily="ui-monospace, SFMono-Regular, monospace"
    >
      <RegTicks w={480} h={240} />

      {/* Platform perimeter — sits on the right, lighter weight */}
      <rect
        x="216"
        y="32"
        width="232"
        height="176"
        rx="10"
        fill="none"
        stroke="#7C7158"
        strokeWidth="1.5"
      />
      <rect x="216" y="32" width="232" height="22" fill="#F1ECE0" />
      <line x1="216" y1="54" x2="448" y2="54" stroke="#7C7158" strokeWidth="1" />
      <text x="228" y="48" fontSize="10" fill="#5B5142" letterSpacing="1">
        kraterion.s3 · multi-region
      </text>
      <text x="436" y="48" fontSize="10" fill="#A89C82" textAnchor="end">
        ●●●
      </text>

      {/* Inner storage zone (dashed) */}
      <rect
        x="236"
        y="74"
        width="192"
        height="120"
        rx="6"
        fill="none"
        stroke="#A89C82"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      <text x="248" y="90" fontSize="9" fill="#7C7158">
        ciphertext only · n=3f+1
      </text>

      {/* Sealed file node — krater dashes + sealed badge */}
      <g transform="translate(292, 112)">
        <rect x="0" y="0" width="56" height="68" rx="3" fill="#FAF7EF" stroke="#5B5142" strokeWidth="1" />
        <polygon points="42,0 56,0 56,14" fill="#E1D9C7" stroke="#5B5142" strokeWidth="1" />
        <line x1="8" y1="26" x2="48" y2="26" stroke="#C45B36" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
        <line x1="8" y1="34" x2="48" y2="34" stroke="#C45B36" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
        <line x1="8" y1="42" x2="48" y2="42" stroke="#C45B36" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
        <line x1="8" y1="50" x2="34" y2="50" stroke="#C45B36" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
        {/* Sealed badge — moved inside file bounds so it doesn't overlap perimeter */}
        <circle cx="50" cy="6" r="7" fill="#C45B36" />
        <path
          d="M47,6 L49,8 L53,4"
          stroke="#FAF7EF"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text x="28" y="62" fontSize="8" fill="#7C7158" textAnchor="middle">
          photo.jpg
        </text>
      </g>

      {/* "You" puck — krater-prominent, OUTSIDE the perimeter, vertically centered */}
      <g transform="translate(96, 120)">
        <circle cx="0" cy="0" r="36" fill="#FAF7EF" stroke="#C45B36" strokeWidth="1.5" />
        <text x="0" y="-6" fontSize="9" fill="#C45B36" textAnchor="middle" letterSpacing="1">
          YOU
        </text>
        {/* Key glyph */}
        <g transform="translate(-10, 4)">
          <circle cx="0" cy="0" r="4" fill="none" stroke="#C45B36" strokeWidth="1.5" />
          <line x1="4" y1="0" x2="16" y2="0" stroke="#C45B36" strokeWidth="1.5" />
          <line x1="12" y1="0" x2="12" y2="4" stroke="#C45B36" strokeWidth="1.5" />
        </g>
        <text x="0" y="22" fontSize="7" fill="#C45B36" textAnchor="middle">
          holds key
        </text>
      </g>

      {/* Connector: you → file (orange, slightly curved) */}
      <path
        d="M132,120 Q 200,116 290,144"
        fill="none"
        stroke="#C45B36"
        strokeWidth="1.25"
        strokeDasharray="4 4"
      />
      <circle cx="132" cy="120" r="2.5" fill="#C45B36" />
      <circle cx="290" cy="144" r="2.5" fill="#C45B36" />
    </svg>
  );
}

/* Corner registration ticks parametrized for any viewBox */
function RegTicks({ w, h }: { w: number; h: number }) {
  return (
    <g stroke="#C9BFA8" strokeWidth="0.75" fill="none" opacity="0.7">
      <path d={`M 4 12 L 4 4 L 12 4`} />
      <path d={`M ${w - 4} 4 L ${w - 12} 4 L ${w - 12} 12`} />
      <path d={`M 4 ${h - 12} L 4 ${h - 4} L 12 ${h - 4}`} />
      <path d={`M ${w - 4} ${h - 4} L ${w - 12} ${h - 4} L ${w - 12} ${h - 12}`} />
    </g>
  );
}
