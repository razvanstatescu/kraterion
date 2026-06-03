import { FadeUp } from "@/components/motion/FadeUp";

const CLAIMS = [
  {
    title: "You own your data and your logs.",
    lede: "Pull raw bytes and full run records over plain HTTPS, from any region. No proprietary export, no vendor-held traces.",
  },
  {
    title: "Sealed before it leaves you.",
    lede: "Encryption is the default, not a setting. The platform stores only ciphertext — files, run records, and memory alike.",
  },
  {
    title: "Tamper-evident by structure.",
    lede: "Every run is recorded so it can't be altered after the fact. You don't take our word for it — you verify it independently.",
  },
  {
    title: "Revocable access — enforced, not promised.",
    lede: "Remove access and reads stop — files and memory together. Not a policy. A property.",
  },
];

export function OwnershipClaims() {
  return (
    <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
      {CLAIMS.map((c, i) => (
        <FadeUp key={c.title} delay={i * 0.05}>
          <h3 className="text-[24px] leading-[1.2] text-cream md:text-[32px]">{c.title}</h3>
          <p className="mt-3 text-[14px] leading-[1.6] text-stone-300">{c.lede}</p>
        </FadeUp>
      ))}
    </div>
  );
}
