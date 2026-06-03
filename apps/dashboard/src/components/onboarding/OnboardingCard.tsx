"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  useDismissOnboarding,
  useOnboarding,
  type OnboardingStepKey,
} from "@/lib/queries";
import { StepVisual } from "./visuals/StepVisual";

interface StepConfig {
  key: OnboardingStepKey;
  index: number;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  doneHref: string;
}

const STEPS: StepConfig[] = [
  {
    key: "buckets",
    index: 1,
    title: "Store your stuff",
    body: "A bucket is where your files live. Drop anything in, get an S3 URL back.",
    ctaLabel: "Create a bucket",
    ctaHref: "/buckets?new=1",
    doneHref: "/buckets",
  },
  {
    key: "knowledge",
    index: 2,
    title: "Make files searchable",
    body: "Turn on knowledge for a bucket. We chunk, embed, and index — so your agents can cite the source.",
    ctaLabel: "Index a file",
    ctaHref: "/buckets",
    doneHref: "/buckets",
  },
  {
    key: "agents",
    index: 3,
    title: "Build an agent",
    body: "Give it knowledge, give it tools, chat with it from the dashboard or your code.",
    ctaLabel: "Create an agent",
    ctaHref: "/agents?new=1",
    doneHref: "/agents",
  },
  {
    key: "integrations",
    index: 4,
    title: "Plug into your stack",
    body: "Kraterion speaks the SDKs you already use. Point them at your endpoint and the rest is the same.",
    ctaLabel: "Get an API key",
    ctaHref: "/keys",
    doneHref: "/keys",
  },
];

type ChipState = "done" | "active" | "pending" | "locked";

/**
 * Compact "Get started" card. Focused-stepper pattern (cf. Stripe,
 * Vercel) — header strip shows all four steps as numbered chips with
 * status; body emphasises the single next-action. Done state collapses
 * to one row. Dismissed state hides entirely; the sidebar's "Get
 * started" entry brings it back.
 */
export function OnboardingCard() {
  const { data, isLoading } = useOnboarding();
  const dismiss = useDismissOnboarding();
  const params = useSearchParams();
  // `?fresh=1` previews the card as if the user has 0 of 4 done and
  // has not dismissed — handy for demos and design QA without touching
  // any data. Active for the lifetime of the current page render.
  const previewFresh = params.get("fresh") === "1";

  const [locallyHidden, setLocallyHidden] = useState(false);
  const [doneExpanded, setDoneExpanded] = useState(false);
  const [focusedKey, setFocusedKey] = useState<OnboardingStepKey | null>(null);

  const stepsByKey = useMemo(() => {
    const map = new Map<OnboardingStepKey, boolean>();
    if (previewFresh) {
      // Pretend none of the steps are completed.
      (["buckets", "knowledge", "agents", "integrations"] as OnboardingStepKey[]).forEach(
        (k) => map.set(k, false),
      );
    } else {
      data?.steps.forEach((s) => map.set(s.key, s.completed));
    }
    return map;
  }, [data, previewFresh]);

  const firstPending = useMemo(
    () => STEPS.find((s) => !stepsByKey.get(s.key)),
    [stepsByKey],
  );

  const completedCount = useMemo(
    () => [...stepsByKey.values()].filter(Boolean).length,
    [stepsByKey],
  );

  // The focused step is whatever the user clicked last, falling back to
  // the lowest-index incomplete step. When the user completes the
  // focused step, advance focus to the next pending one.
  const focused = useMemo(() => {
    if (focusedKey) {
      const explicit = STEPS.find((s) => s.key === focusedKey);
      if (explicit) return explicit;
    }
    return firstPending ?? STEPS[STEPS.length - 1];
  }, [focusedKey, firstPending]);

  // If the focused step ticks complete (e.g. user came back after
  // creating a bucket), auto-advance to the next pending one. Skip the
  // shift if the user has explicitly clicked a chip — that's an intent
  // signal we want to respect.
  useEffect(() => {
    if (focusedKey && stepsByKey.get(focusedKey)) {
      // Was completed while focused — release focus so the natural
      // first-pending advance happens.
      setFocusedKey(null);
    }
  }, [focusedKey, stepsByKey]);

  // In preview mode we still render even before the server payload
  // arrives — there's nothing to fetch for a forced-fresh view.
  if (!previewFresh) {
    if (isLoading || !data) return null;
    if (data.dismissed_at) return null;
  }
  if (locallyHidden) return null;

  const allDone = completedCount === STEPS.length;
  const onDismiss = () => {
    setLocallyHidden(true);
    dismiss.mutate();
  };

  const chipStateFor = (step: StepConfig): ChipState => {
    if (stepsByKey.get(step.key)) return "done";
    if (step.key === focused?.key) return "active";
    // Step 2 is gated on step 1.
    if (step.key === "knowledge" && !stepsByKey.get("buckets"))
      return "locked";
    return "pending";
  };

  // === Done state — single collapsed row, optional expand ===========
  if (allDone) {
    return (
      <section className="onb-bar" aria-label="Onboarding (complete)">
        <div className="onb-bar-row">
          <div className="onb-bar-left">
            <span className="onb-check-pill">
              <Icon name="check" size={14} />
            </span>
            <span className="onb-bar-title">All set</span>
            <span className="onb-bar-meta">· 4 of 4 done</span>
          </div>
          <div className="onb-bar-right">
            <button
              type="button"
              className="onb-link-btn"
              onClick={() => setDoneExpanded((v) => !v)}
            >
              {doneExpanded ? "Hide steps" : "Review steps"}{" "}
              <span aria-hidden>{doneExpanded ? "▴" : "▾"}</span>
            </button>
            <button
              type="button"
              className="onb-dismiss"
              onClick={onDismiss}
              aria-label="Dismiss onboarding"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>
        {doneExpanded ? (
          <ul className="onb-done-list">
            {STEPS.map((step) => (
              <li key={step.key} className="onb-done-item">
                <span className="onb-step-num onb-step-num-done">
                  <Icon name="check" size={14} />
                </span>
                <span className="onb-done-title">{step.title}</span>
                <Link href={step.doneHref} className="onb-link-btn">
                  Open ↗
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  // === In-progress state — focused stepper ==========================

  if (!focused) return null;
  const locked =
    focused.key === "knowledge" && !stepsByKey.get("buckets");

  return (
    <section className="onb-bar" aria-label="Get started">
      <div className="onb-bar-row">
        <div className="onb-bar-left">
          <span className="onb-bar-title">Get started</span>
          <span className="onb-bar-meta">
            · {completedCount} of {STEPS.length} done
          </span>
        </div>
        <div className="onb-bar-right">
          <div className="onb-chip-strip" role="tablist">
            {STEPS.map((step) => {
              const state = chipStateFor(step);
              const label = `Step ${step.index} — ${step.title}`;
              return (
                <button
                  key={step.key}
                  type="button"
                  role="tab"
                  aria-selected={state === "active"}
                  aria-label={label}
                  title={step.title}
                  onClick={() => setFocusedKey(step.key)}
                  className={`onb-step-num onb-step-num-${state}`}
                >
                  {state === "done" ? (
                    <Icon name="check" size={14} />
                  ) : (
                    String(step.index).padStart(2, "0")
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="onb-dismiss"
            onClick={onDismiss}
            aria-label="Dismiss onboarding"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>

      <div className="onb-focus">
        {/* Faded background watermark — full height, right-aligned,
            mask-fades toward the left so the text reads cleanly. */}
        <div
          className={`onb-focus-bg onb-focus-bg-${focused.key}`}
          aria-hidden
        >
          <StepVisual stepKey={focused.key} />
        </div>
        <div className="onb-focus-content">
          <div className="onb-focus-eyebrow">
            {stepsByKey.get(focused.key)
              ? "Reviewing"
              : focused.key === firstPending?.key
                ? "Next"
                : "Step"}{" "}
            {String(focused.index).padStart(2, "0")}
          </div>
          <div className="onb-focus-title">{focused.title}</div>
          <p className="onb-focus-body">{focused.body}</p>
          <div className="onb-focus-foot">
            {stepsByKey.get(focused.key) ? (
              <Link href={focused.doneHref} className="onb-step-cta">
                Open ↗
              </Link>
            ) : locked ? (
              <span className="onb-step-hint">Finish step 01 first.</span>
            ) : (
              <Link
                href={focused.ctaHref}
                className="onb-step-cta onb-step-cta-primary"
              >
                {focused.ctaLabel}
              </Link>
            )}
            {firstPending && firstPending.key !== focused.key ? (
              <button
                type="button"
                className="onb-link-btn"
                onClick={() => setFocusedKey(firstPending.key)}
              >
                Back to next step
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
