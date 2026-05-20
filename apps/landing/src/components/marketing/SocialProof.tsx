import { FadeUp } from "@/components/motion/FadeUp";

const LOGOS = ["Quanta Labs", "Northhaven", "Atelier OS", "Loomstack", "Saltworks", "Pier 14"];

export function SocialProof() {
  return (
    <div className="border-y border-stone-200/60 bg-cream py-16">
      <div className="mx-auto max-w-[1280px] px-6">
        <FadeUp>
          <p className="micro text-center text-stone-500">Trusted by builders at</p>
        </FadeUp>
        <FadeUp delay={0.1}>
          <div className="mt-8 grid grid-cols-2 items-center justify-items-center gap-x-6 gap-y-8 sm:grid-cols-3 md:grid-cols-6">
            {LOGOS.map((name) => (
              <div
                key={name}
                className="text-[15px] font-medium tracking-[0.04em] text-stone-500"
              >
                {name}
              </div>
            ))}
          </div>
        </FadeUp>
        <FadeUp delay={0.2}>
          <p className="mt-8 text-center text-[14px] text-stone-600">
            From weekend projects to teams that ship every day.
          </p>
        </FadeUp>
      </div>
    </div>
  );
}
