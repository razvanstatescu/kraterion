"use client";

import dynamic from "next/dynamic";
import { ApertureFallback } from "./ApertureHero";

const ApertureHero = dynamic(
  () => import("./ApertureHero").then((m) => m.ApertureHero),
  { ssr: false, loading: () => <ApertureFallback /> }
);

export function ApertureHeroLazy() {
  return <ApertureHero />;
}
