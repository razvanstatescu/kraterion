// Mark — Kraterion aperture, theme-aware.
const Mark = ({ size = 24, variant = "light", animate = "none" }) => {
  const variants = {
    light: { outer: "#A89C82", middle: "#0F0E0C", dot: "#C45B36" },
    dark:  { outer: "#7C7158", middle: "#F8F4EC", dot: "#C45B36" },
    krater:{ outer: "#F8F4EC", middle: "#F8F4EC", dot: "#F8F4EC" },
    mono:  { outer: "currentColor", middle: "currentColor", dot: "currentColor" },
  };
  const c = variants[variant];
  const sw = Math.max(1.5, size * 0.025);
  const cls = animate === "pulse" ? "k-mark k-pulse"
            : animate === "spin"  ? "k-mark k-spin"
            : animate === "iris"  ? "k-mark k-iris" : "k-mark";
  return (
    <svg className={cls} viewBox="0 0 256 256" width={size} height={size}>
      <circle data-ring="outer"  cx="128" cy="128" r="110" fill="none" stroke={c.outer}  strokeWidth={sw * 2.4}/>
      <circle data-ring="middle" cx="128" cy="128" r="68"  fill="none" stroke={c.middle} strokeWidth={sw * 2.4}/>
      <circle data-ring="dot"    cx="128" cy="128" r="22"  fill={c.dot}/>
    </svg>
  );
};

window.Mark = Mark;
