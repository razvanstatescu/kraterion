"use client";

import { Icon, type IconName } from "@/components/ui/Icon";
import type { OnboardingStepKey } from "@/lib/queries";

/**
 * Per-step visual for the onboarding card's focused-step preview.
 * Single-row horizontal flow, hairline-bordered chips, ArrowRight
 * connectors — same vocabulary as the landing's `BucketFlowStatic`,
 * scaled to fit a ~260px-wide right column. The "destination" chip on
 * each flow picks up the krater accent so the eye lands there.
 */
export function StepVisual({ stepKey }: { stepKey: OnboardingStepKey }) {
  switch (stepKey) {
    case "buckets":
      return <BucketsVisual />;
    case "knowledge":
      return <KnowledgeVisual />;
    case "agents":
      return <AgentsVisual />;
    case "integrations":
      return <IntegrationsVisual />;
  }
}

// === Per-step compositions ====================================

function BucketsVisual() {
  return (
    <FlowRow>
      <Stack>
        <FlowChip iconName="file" muted={2} />
        <FlowChip iconName="file" muted={1} />
        <FlowChip iconName="file" />
      </Stack>
      <FlowArrow />
      <FlowChip iconName="bucket" accent />
    </FlowRow>
  );
}

function KnowledgeVisual() {
  return (
    <FlowRow>
      <FlowChip iconName="text" />
      <FlowArrow />
      <DotGrid />
      <FlowArrow />
      <FlowChip iconName="search" accent />
    </FlowRow>
  );
}

function AgentsVisual() {
  return (
    <FlowRow>
      <FlowChip iconName="brain" accent size="lg" />
      <span className="onb-vis-plus" aria-hidden>
        +
      </span>
      <div className="onb-vis-cluster">
        <FlowChip iconName="search" size="sm" />
        <FlowChip iconName="folder" size="sm" />
        <FlowChip iconName="code" size="sm" />
      </div>
    </FlowRow>
  );
}

function IntegrationsVisual() {
  const labels = ["openai", "vercel ai", "langgraph", "mcp"];
  return (
    <div className="onb-vis-int">
      {labels.map((l) => (
        <span key={l} className="onb-vis-int-chip">
          {l}
        </span>
      ))}
      <span className="onb-vis-int-dot" aria-hidden />
    </div>
  );
}

// === Atoms ===================================================

function FlowRow({ children }: { children: React.ReactNode }) {
  return <div className="onb-vis-row">{children}</div>;
}

function FlowArrow() {
  return (
    <span className="onb-vis-arrow" aria-hidden>
      <Icon name="arrow-up-right" size={14} style={{ transform: "rotate(45deg)" }} />
    </span>
  );
}

function FlowChip({
  iconName,
  accent,
  muted,
  size = "md",
}: {
  iconName: IconName;
  accent?: boolean;
  muted?: 0 | 1 | 2;
  size?: "sm" | "md" | "lg";
}) {
  const classes = ["onb-vis-chip", `onb-vis-chip-${size}`];
  if (accent) classes.push("onb-vis-chip-accent");
  if (muted) classes.push(`onb-vis-chip-muted-${muted}`);
  const iconSize = size === "sm" ? 14 : size === "lg" ? 20 : 16;
  return (
    <span className={classes.join(" ")}>
      <Icon name={iconName} size={iconSize} />
    </span>
  );
}

function Stack({ children }: { children: React.ReactNode }) {
  return <div className="onb-vis-stack">{children}</div>;
}

function DotGrid() {
  return (
    <span className="onb-vis-dotgrid" aria-hidden>
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="onb-vis-dot" />
      ))}
    </span>
  );
}
