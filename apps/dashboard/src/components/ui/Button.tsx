import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "cta" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", size = "md", icon, iconRight, loading, disabled, className, children, ...rest },
  ref,
) {
  const classes = ["btn", `btn-${variant}`];
  if (size === "lg") classes.push("btn-lg");
  if (size === "sm") classes.push("btn-sm");
  if (className) classes.push(className);

  const iconSize = size === "sm" ? 14 : 16;

  return (
    <button
      ref={ref}
      className={classes.join(" ")}
      disabled={disabled || loading}
      {...rest}
    >
      {icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={iconSize} /> : null}
    </button>
  );
});
