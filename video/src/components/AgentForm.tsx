import React from "react";
import { color } from "../tokens/color";
import { fonts, size as fs, weight } from "../tokens/type";
import { space, radius } from "../tokens/spacing";
import { WordReveal } from "./WordReveal";

type Props = {
  /** Frame each field begins revealing, relative to component mount. */
  fieldDelays: {
    name: number;
    model: number;
    prompt: number;
    buckets: number;
  };
};

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: fs.caption,
      fontWeight: weight.medium,
      color: color.stone[500],
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      marginBottom: space[2],
    }}
  >
    {children}
  </div>
);

const FieldShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      border: `1px solid ${color.hairlineLight}`,
      borderRadius: radius.card,
      padding: `${space[3]}px ${space[4]}px`,
      background: color.cream,
      fontSize: fs.body,
      color: color.ink,
      lineHeight: 1.5,
    }}
  >
    {children}
  </div>
);

export const AgentForm: React.FC<Props> = ({ fieldDelays }) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: space[6],
        fontFamily: fonts.sans,
        width: 640,
      }}
    >
      <div
        style={{
          fontSize: fs.h2,
          fontWeight: weight.medium,
          color: color.ink,
          letterSpacing: "-0.02em",
          marginBottom: space[2],
        }}
      >
        New agent
      </div>

      <div>
        <FieldLabel>Name</FieldLabel>
        <FieldShell>
          <span style={{ fontFamily: fonts.mono, fontSize: fs.codeSmall }}>
            <WordReveal text="research-assistant" delay={fieldDelays.name} />
          </span>
        </FieldShell>
      </div>

      <div>
        <FieldLabel>Model</FieldLabel>
        <FieldShell>
          <span style={{ fontFamily: fonts.mono, fontSize: fs.codeSmall }}>
            <WordReveal text="gpt-4o-mini" delay={fieldDelays.model} />
          </span>
        </FieldShell>
      </div>

      <div>
        <FieldLabel>System prompt</FieldLabel>
        <FieldShell>
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: fs.codeSmall,
              color: color.ink,
              whiteSpace: "pre-wrap",
              lineHeight: 1.55,
            }}
          >
            <WordReveal
              text="You are a research assistant. Cite chunks from the connected bucket. Be precise; one sentence per bullet."
              delay={fieldDelays.prompt}
            />
          </div>
        </FieldShell>
      </div>

      <div>
        <FieldLabel>Buckets</FieldLabel>
        <div style={{ display: "flex", gap: space[2], flexWrap: "wrap" }}>
          <div
            style={{
              padding: `${space[2]}px ${space[3]}px`,
              border: `1px solid ${color.hairlineLight}`,
              borderRadius: 999,
              background: color.stone[100],
              fontFamily: fonts.mono,
              fontSize: fs.caption,
              color: color.ink,
            }}
          >
            <WordReveal text="research-notes/" delay={fieldDelays.buckets} />
          </div>
        </div>
      </div>
    </div>
  );
};
