import { FadeUp } from "@/components/motion/FadeUp";

const CLAIMS = [
  {
    title: "You actually own your data.",
    lede: "Pull your raw bytes over plain HTTPS from any region. No proprietary export.",
  },
  {
    title: "Sealed before it leaves you.",
    lede: "Encryption is the default, not a setting. The platform stores only ciphertext.",
  },
  {
    title: "Revocable access — enforced, not promised.",
    lede: "When you remove access, decryption stops. Not a policy. A property.",
  },
  {
    title: "Predictable pricing.",
    lede: "Cheap egress with a 50 GB monthly free band. Flat rate above it — no tier cliffs, no retrieval fees, no surprise bill on a busy weekend.",
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
