"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

interface Slide {
  eyebrow: string;
  headline: string;
  body: string;
  icon: IconName;
}

const SLIDES: Slide[] = [
  {
    eyebrow: "01 — Ownership",
    headline: "Every file is yours on-chain.",
    body: "Objects are SharedBlobs on Walrus, owned by your Sui address. If you leave, the bytes don't leave with us.",
    icon: "database",
  },
  {
    eyebrow: "02 — Encryption",
    headline: "Sealed by you, not by us.",
    body: "Files are encrypted with Seal before they reach Walrus. The keys are held by independent key servers — not by Kraterion.",
    icon: "lock",
  },
  {
    eyebrow: "03 — Revocability",
    headline: "Revoke us and we can't read it anymore.",
    body: "Platform access is an on-chain policy you control. Revoke it and the key servers stop signing for us. Cryptographically enforced, not a promise.",
    icon: "shieldOff",
  },
  {
    eyebrow: "04 — Compatibility",
    headline: "Point your S3 SDK here. Done.",
    body: "PutObject, GetObject, presigned URLs — all the boring parts work. Your existing aws-sdk code doesn't know the storage is on Walrus.",
    icon: "code",
  },
];

const INTERVAL_MS = 6000;

export function LoginStoryPanel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % SLIDES.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <div
      className="ks-login-story-inner"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="ks-login-slides" aria-live="polite">
        {SLIDES.map((slide, i) => (
          <article
            key={slide.eyebrow}
            className="ks-login-slide"
            data-active={i === active || undefined}
            aria-hidden={i !== active}
          >
            <div className="ks-login-slide-eyebrow">
              <Icon name={slide.icon} size={16} />
              <span>{slide.eyebrow}</span>
            </div>
            <h2 className="ks-login-slide-headline">{slide.headline}</h2>
            <p className="ks-login-slide-body">{slide.body}</p>
          </article>
        ))}
      </div>

      <div className="ks-login-dots" role="tablist" aria-label="Story slides">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.eyebrow}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`Slide ${i + 1}: ${slide.headline}`}
            className="ks-login-dot"
            data-active={i === active || undefined}
            onClick={() => setActive(i)}
          />
        ))}
      </div>
    </div>
  );
}
