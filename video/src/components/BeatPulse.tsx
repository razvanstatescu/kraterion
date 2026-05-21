import React from "react";

/**
 * BeatPulse is dead. The brand explicitly rejects bouncy / pulse motion
 * ("No bouncy springs"). The named "aperture pulse" (scale 1→1.05→1
 * over 2.5s) is reserved for the brand mark itself, not for arbitrary
 * elements throbbing on every beat.
 *
 * This stub passes children through unchanged so any leftover imports
 * still compile.
 */
type Props = {
  children: React.ReactNode;
  amount?: number;
  every?: number;
  fromFrame?: number;
};

export const BeatPulse: React.FC<Props> = ({ children }) => <>{children}</>;
