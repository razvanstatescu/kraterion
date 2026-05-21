import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { space, radius } from "../tokens/spacing";
import { TrackingExpand, SubtractiveReveal } from "../components/Entrances";
import { EASE_IRIS, EASE_BRAND } from "../motion/easings";

/**
 * S03 — IDENTITY (11 s). "Smart object storage. Humans + agents."
 *
 * Cross-cut split: left panel shows the human (boto3 code), right panel
 * shows the agent (a tool call). Same idea, two callers. The headline
 * lands first with TrackingExpand, then the two panels reveal beneath
 * with SubtractiveReveal (a cream curtain slides off each in turn).
 */
export const S03_Buckets: React.FC = () => {
  const frame = useCurrentFrame();

  const HEADLINE_IN = 4;
  const HUMAN_PANEL_IN = 38;
  const AGENT_PANEL_IN = 60;

  const fadeIn = (start: number, dur = 12) =>
    interpolate(frame, [start, start + dur], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_BRAND,
    });

  return (
    <AbsoluteFill
      style={{
        background: color.cream,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: space[16],
        padding: `${space[16]}px ${space[16]}px`,
      }}
    >
      {/* Headline */}
      <h2
        style={{
          margin: 0,
          fontFamily: fonts.sans,
          fontSize: fs.display,
          fontWeight: weight.regular,
          color: color.ink,
          textAlign: "center",
          lineHeight: 0.95,
        }}
      >
        <span style={{ display: "inline-block", letterSpacing: tracking.display }}>
          <TrackingExpand text="Smart object storage." startFrame={HEADLINE_IN} />
        </span>
        <br />
        <span
          style={{
            color: color.stone[600],
            display: "inline-block",
            letterSpacing: tracking.display,
          }}
        >
          <TrackingExpand text="Humans and agents." startFrame={HEADLINE_IN + 14} />
        </span>
      </h2>

      {/* Cross-cut row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: space[8],
          width: 1280,
        }}
      >
        {/* Human side */}
        <div style={{ opacity: fadeIn(HUMAN_PANEL_IN, 14) }}>
          <span
            style={{
              fontFamily: fonts.sans,
              fontSize: fs.micro,
              fontWeight: weight.medium,
              color: color.stone[500],
              letterSpacing: tracking.caps,
              textTransform: "uppercase",
            }}
          >
            Humans
          </span>
          <SubtractiveReveal
            startFrame={HUMAN_PANEL_IN + 4}
            durationInFrames={16}
            direction="left"
            overlay={color.cream}
            style={{ width: "100%", marginTop: space[2] }}
          >
            <div
              style={{
                background: color.stone[50],
                border: `1px solid ${color.border}`,
                borderRadius: radius.card,
                padding: `${space[6]}px ${space[6]}px`,
                fontFamily: fonts.mono,
                fontSize: fs.codeSmall,
                color: color.ink,
                lineHeight: 1.7,
                width: "100%",
              }}
            >
              <div>
                <span style={{ color: color.stone[500] }}>$ </span>
                aws s3 cp data.json s3://yours \
              </div>
              <div>
                &nbsp;&nbsp;--endpoint-url{" "}
                <span style={{ color: color.ink }}>s3.kraterion.com</span>
              </div>
              <div style={{ color: color.stone[500] }}>↳ upload: 314 KB · sealed</div>
            </div>
          </SubtractiveReveal>
        </div>

        {/* Agent side */}
        <div style={{ opacity: fadeIn(AGENT_PANEL_IN, 14) }}>
          <span
            style={{
              fontFamily: fonts.sans,
              fontSize: fs.micro,
              fontWeight: weight.medium,
              color: color.stone[500],
              letterSpacing: tracking.caps,
              textTransform: "uppercase",
            }}
          >
            Agents
          </span>
          <SubtractiveReveal
            startFrame={AGENT_PANEL_IN + 4}
            durationInFrames={16}
            direction="right"
            overlay={color.cream}
            style={{ width: "100%", marginTop: space[2] }}
          >
            <div
              style={{
                background: color.stone[50],
                border: `1px solid ${color.border}`,
                borderRadius: radius.card,
                padding: `${space[6]}px ${space[6]}px`,
                fontFamily: fonts.mono,
                fontSize: fs.codeSmall,
                color: color.ink,
                lineHeight: 1.7,
                width: "100%",
              }}
            >
              <div>
                <span style={{ color: color.stone[500] }}>{">"} </span>
                openai.responses.create(&#123;
              </div>
              <div>
                &nbsp;&nbsp;baseURL:{" "}
                <span style={{ color: color.ink }}>"kraterion.com/v1/agents"</span>,
              </div>
              <div>&#125;)</div>
            </div>
          </SubtractiveReveal>
        </div>
      </div>
    </AbsoluteFill>
  );
};
