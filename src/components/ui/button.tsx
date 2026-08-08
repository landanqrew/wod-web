import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "quiet" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-on-primary font-semibold shadow-glow hover:bg-primary-bright disabled:shadow-none",
  ghost: "border border-border-hi text-ink hover:bg-muted",
  quiet: "text-muted-fg hover:bg-muted hover:text-ink",
  danger:
    "border border-danger/35 bg-danger/10 text-danger hover:bg-danger/15",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[13px]",
  md: "h-9 px-4 text-sm",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  className,
  variant = "ghost",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-medium transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    />
  );
}
