"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useEffect, useState, Suspense } from "react";
import * as THREE from "three";

const COLORS = {
  outer: "#7C7158",
  middle: "#403930",
  dot: "#C45B36",
  background: "#F8F4EC",
};

function Ring({
  radius,
  thickness,
  color,
  delay,
  rotateSpeed = 0,
  scrollProgress,
}: {
  radius: number;
  thickness: number;
  color: string;
  delay: number;
  rotateSpeed?: number;
  scrollProgress: React.MutableRefObject<number>;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const startTime = useRef<number | null>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    if (startTime.current === null) startTime.current = clock.elapsedTime;
    const t = clock.elapsedTime - startTime.current;
    const introT = Math.max(0, Math.min(1, (t - delay) / 0.6));
    // ease-out
    const eased = 1 - Math.pow(1 - introT, 3);
    const baseScale = eased;
    // scroll follow-through: outer rings drift outward, inner contracts
    const drift = scrollProgress.current * (radius === 1.6 ? 0.5 : radius === 1.0 ? 0 : -0.4);
    const scale = baseScale * (1 + drift);
    ref.current.scale.setScalar(scale);
    ref.current.rotation.z += rotateSpeed * 0.016;
    (ref.current.material as THREE.MeshBasicMaterial).opacity =
      eased * (1 - scrollProgress.current * (radius === 1.6 ? 0.6 : 0.3));
  });

  return (
    <mesh ref={ref}>
      <ringGeometry args={[radius - thickness / 2, radius + thickness / 2, 96]} />
      <meshBasicMaterial color={color} transparent />
    </mesh>
  );
}

function Dot({ scrollProgress }: { scrollProgress: React.MutableRefObject<number> }) {
  const ref = useRef<THREE.Mesh>(null);
  const startTime = useRef<number | null>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    if (startTime.current === null) startTime.current = clock.elapsedTime;
    const t = clock.elapsedTime - startTime.current;
    const introT = Math.max(0, Math.min(1, (t - 1.0) / 0.4));
    // overshoot for krater-pop
    const overshoot = 1 + 0.4 * introT - 0.4 * introT * introT;
    ref.current.scale.setScalar(introT * overshoot);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = introT;
  });

  return (
    <mesh ref={ref}>
      <circleGeometry args={[0.18, 64]} />
      <meshBasicMaterial color={COLORS.dot} transparent />
    </mesh>
  );
}

function ApertureScene() {
  const scrollProgress = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const max = window.innerHeight * 0.8;
      scrollProgress.current = Math.max(0, Math.min(1, window.scrollY / max));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <Ring
        radius={1.6}
        thickness={0.04}
        color={COLORS.outer}
        delay={0.2}
        rotateSpeed={-0.07}
        scrollProgress={scrollProgress}
      />
      <Ring
        radius={1.0}
        thickness={0.06}
        color={COLORS.middle}
        delay={0.5}
        scrollProgress={scrollProgress}
      />
      <Ring
        radius={0.48}
        thickness={0.05}
        color={COLORS.outer}
        delay={0.8}
        rotateSpeed={0.05}
        scrollProgress={scrollProgress}
      />
      <Dot scrollProgress={scrollProgress} />
    </>
  );
}

export function ApertureHero() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [isSmall, setIsSmall] = useState(false);

  useEffect(() => {
    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sizeMq = window.matchMedia("(max-width: 767px)");
    setReduceMotion(motionMq.matches);
    setIsSmall(sizeMq.matches);
    const onMotion = () => setReduceMotion(motionMq.matches);
    const onSize = () => setIsSmall(sizeMq.matches);
    motionMq.addEventListener("change", onMotion);
    sizeMq.addEventListener("change", onSize);
    return () => {
      motionMq.removeEventListener("change", onMotion);
      sizeMq.removeEventListener("change", onSize);
    };
  }, []);

  if (reduceMotion || isSmall) {
    return <ApertureFallback />;
  }

  return (
    <div className="relative aspect-square w-full max-w-[480px]">
      <Canvas
        orthographic
        camera={{ position: [0, 0, 5], zoom: 100 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <ApertureScene />
        </Suspense>
      </Canvas>
      <span className="sr-only">Kraterion logo aperture animation</span>
    </div>
  );
}

export function ApertureFallback() {
  return (
    <div
      className="grid aspect-square w-full max-w-[480px] place-items-center"
      style={{ animation: "iris-open 1200ms cubic-bezier(0.16, 1, 0.3, 1)" }}
      role="img"
      aria-label="Kraterion mark"
    >
      <svg viewBox="0 0 256 256" className="h-full w-full">
        <circle cx="128" cy="128" r="110" fill="none" stroke="#7C7158" strokeWidth="6" />
        <circle cx="128" cy="128" r="68" fill="none" stroke="#403930" strokeWidth="6" />
        <circle cx="128" cy="128" r="22" fill="#C45B36" />
      </svg>
    </div>
  );
}
