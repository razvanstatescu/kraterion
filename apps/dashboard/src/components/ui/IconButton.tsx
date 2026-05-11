import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  name: IconName;
  size?: 14 | 16 | 20;
  /** Accessible label — required because there's no visible text. */
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { name, size = 16, label, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={["icon-btn", className].filter(Boolean).join(" ")}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={name} size={size} />
    </button>
  );
});
