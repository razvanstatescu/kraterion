import { Lock, Key, ShieldCheck, ScrollText } from "lucide-react";
import { BentoTile, BentoBody } from "./rich/BentoGrid";
import { BucketRow } from "./rich/DashboardSlice";

export function PillarBento() {
  return (
    <div className="grid auto-rows-fr gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-3">
      {/* Wide hero tile — S3 compatibility */}
      <BentoTile span="2x1" tone="cream" className="min-h-[320px]">
        <BentoBody
          eyebrow="01 — Storage"
          title="S3 from day one."
          lede="boto3, aws-cli, rclone, JS SDK — all work today. Multipart, presigned URLs, lifecycle rules."
        />
        <div className="mt-auto px-6 pb-6 md:px-8 md:pb-8">
          <div className="overflow-hidden rounded-md border border-stone-200/60 bg-stone-50">
            <BucketRow
              name="assets-prod"
              objects="4,812 objects"
              size="24.6 GB"
              access="team-read-write"
              created="18d"
            />
            <BucketRow
              name="model-eval-runs"
              objects="142 objects"
              size="2.4 GB"
              access="private"
              created="6d"
              highlight
            />
          </div>
        </div>
      </BentoTile>

      {/* Knowledge — single column */}
      <BentoTile span="1x1" tone="ink" className="min-h-[320px]">
        <BentoBody
          eyebrow="02 — Knowledge"
          title="Searchable, citable."
          lede="Every file is indexed and bound to citations."
        />
        <div className="mt-auto px-6 pb-6 md:px-8 md:pb-8">
          <div className="overflow-hidden rounded-md border border-stone-200/80">
            <div className="grid grid-cols-6 gap-0.5 bg-stone-200/60 p-px">
              {Array.from({ length: 18 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square"
                  style={{
                    background:
                      i % 5 === 0 ? "rgba(196,91,54,0.75)" : "rgba(196,91,54,0.18)",
                  }}
                />
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-stone-200/80 bg-cream px-3 py-2 font-mono text-[10px] text-stone-600">
              <span>18 chunks</span>
              <span>top-k = 4</span>
            </div>
          </div>
        </div>
      </BentoTile>

      {/* Agents */}
      <BentoTile span="1x1" tone="cream" className="min-h-[300px]">
        <BentoBody
          eyebrow="03 — Agents"
          title="OpenAI-compatible."
          lede="Point any OpenAI client at /v1/agents."
        />
        <div className="mt-auto px-6 pb-6 md:px-8 md:pb-8">
          <div className="rounded-md border border-stone-200/60 bg-stone-50 p-3 font-mono text-[11px] leading-[1.7]">
            <div className="text-stone-500">// drop-in</div>
            <div>
              <span className="text-stone-700">baseURL:</span>{" "}
              <span className="text-krater">&quot;.../v1/agents/support&quot;</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-stone-200/60 pt-2 text-[10px] text-stone-500">
              <span>5 built-in tools</span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-1 w-1 rounded-full bg-[color:var(--color-success)]" />
                ready
              </span>
            </div>
          </div>
        </div>
      </BentoTile>

      {/* Embed */}
      <BentoTile span="1x1" tone="cream" className="min-h-[300px]">
        <BentoBody
          eyebrow="04 — Embed"
          title="One script tag."
          lede="Drop chat on any site. Origin-locked tokens."
        />
        <div className="mt-auto px-6 pb-6 md:px-8 md:pb-8">
          <div className="space-y-2">
            <div className="rounded-md border border-stone-200/60 bg-stone-50 px-3 py-2 font-mono text-[11px] text-stone-700">
              &lt;script src=&quot;<span className="text-krater">embed.kraterion.com/v1.js</span>&quot; /&gt;
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[10px]">
              <Pip label="9 KB" />
              <Pip label="defer-loaded" />
              <Pip label="origin-locked" />
            </div>
          </div>
        </div>
      </BentoTile>

      {/* Ownership */}
      <BentoTile span="1x1" tone="ink" className="min-h-[300px]">
        <BentoBody
          eyebrow="05 — Ownership"
          title="Sealed. Revocable."
          lede="You hold the keys."
        />
        <div className="mt-auto px-6 pb-6 md:px-8 md:pb-8">
          <ul className="space-y-2 text-[12px]">
            <OwnRow icon={Lock} label="Sealed" value="client-side" />
            <OwnRow icon={Key} label="Keys" value="held by you" />
            <OwnRow icon={ShieldCheck} label="Revoke" value="policy-enforced" />
            <OwnRow icon={ScrollText} label="Audit" value="tamper-evident" />
          </ul>
        </div>
      </BentoTile>
    </div>
  );
}

function Pip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center justify-center rounded-sm border border-stone-200/60 bg-stone-50 px-1.5 py-1 font-mono text-stone-600">
      {label}
    </span>
  );
}

function OwnRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Lock;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center justify-between border-b border-stone-200/70 pb-1.5 last:border-b-0 last:pb-0">
      <span className="flex items-center gap-2">
        <Icon size={12} strokeWidth={1.5} className="text-stone-500" />
        <span className="text-stone-700">{label}</span>
      </span>
      <span className="font-mono text-stone-600">{value}</span>
    </li>
  );
}
