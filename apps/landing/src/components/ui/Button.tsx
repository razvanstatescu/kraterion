import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const button = cva(
  [
    "inline-flex items-center justify-center gap-2",
    "font-medium",
    "rounded-md",
    "transition-[background-color,color,transform] duration-[160ms]",
    "active:scale-[0.98]",
    "disabled:opacity-40 disabled:pointer-events-none",
    "whitespace-nowrap",
  ],
  {
    variants: {
      variant: {
        primary: "bg-ink text-cream hover:bg-stone-800",
        primaryOnInk: "bg-cream text-ink hover:bg-stone-100",
        secondary: "bg-transparent text-ink hover:bg-stone-100 border border-stone-200",
        ghost: "bg-transparent text-ink hover:bg-stone-100",
        krater: "bg-krater text-cream hover:opacity-90",
      },
      size: {
        sm: "h-9 px-3 text-[14px]",
        md: "h-11 px-5 text-[15px]",
        lg: "h-12 px-6 text-[16px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

type ButtonVariants = VariantProps<typeof button>;

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVariants {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(button({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";

export interface ButtonLinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement>,
    ButtonVariants {}

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  ({ className, variant, size, ...props }, ref) => (
    <a ref={ref} className={cn(button({ variant, size }), className)} {...props} />
  )
);
ButtonLink.displayName = "ButtonLink";
