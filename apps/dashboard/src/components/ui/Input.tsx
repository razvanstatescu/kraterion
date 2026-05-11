import { forwardRef, type InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { error, className, ...rest },
  ref,
) {
  const classes = ["input"];
  if (error) classes.push("error");
  if (className) classes.push(className);
  return <input ref={ref} className={classes.join(" ")} {...rest} />;
});
