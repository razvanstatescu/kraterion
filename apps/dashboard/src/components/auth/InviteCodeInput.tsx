"use client";

import { useId } from "react";

/**
 * Invite-code field for the sign-in page. Kraterion is invite-only: new
 * accounts must present a `KRT-XXXXXX` code (returning users leave it blank).
 *
 * The `KRT-` prefix is a fixed adornment; the user types only the six-char
 * body. Input is filtered to the unambiguous alphabet and uppercased. `onChange`
 * receives the full `KRT-XXXXXX` once six chars are entered, else "".
 */

// Mirrors the server alphabet (no 0/O/1/I).
const ALPHABET = /[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g;
const BODY_LEN = 6;

interface Props {
  /** The six-char body (without the KRT- prefix). */
  value: string;
  /** Called with the raw body; parent derives the full code. */
  onChange: (body: string) => void;
  invalid?: boolean;
  disabled?: boolean;
}

export function InviteCodeInput({ value, onChange, invalid, disabled }: Props) {
  const id = useId();

  const handle = (raw: string) => {
    const cleaned = (raw.toUpperCase().match(ALPHABET) ?? []).join("").slice(0, BODY_LEN);
    onChange(cleaned);
  };

  return (
    <div className="ks-invite">
      <label className="ks-invite-label" htmlFor={id}>
        Invite code
      </label>
      <div className="ks-invite-field" data-invalid={invalid || undefined}>
        <span className="ks-invite-prefix" aria-hidden="true">
          KRT-
        </span>
        <input
          id={id}
          className="ks-invite-input"
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={BODY_LEN}
          placeholder="XXXXXX"
          value={value}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(e) => handle(e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            handle(e.clipboardData.getData("text"));
          }}
        />
      </div>
      <p className="ks-invite-help">Required for new accounts. Returning? Leave it blank.</p>
    </div>
  );
}

/** Compose the full code from a six-char body, or "" if incomplete. */
export function fullInviteCode(body: string): string {
  return body.length === BODY_LEN ? `KRT-${body}` : "";
}
