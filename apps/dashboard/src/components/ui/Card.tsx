import type { CSSProperties, ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Card({ children, className, style }: Props) {
  return (
    <div className={["card", className].filter(Boolean).join(" ")} style={style}>
      {children}
    </div>
  );
}
