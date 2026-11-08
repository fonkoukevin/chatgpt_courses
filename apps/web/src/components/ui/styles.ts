import { cn } from "@/lib/utils";

export const focusStyle = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "link";
export type ButtonSize = "sm" | "md" | "icon";

const variants: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-brand text-background enabled:hover:bg-brand-hover",
  secondary: "border-control bg-surface text-foreground enabled:hover:bg-surface-subtle",
  ghost: "border-transparent bg-transparent text-foreground enabled:hover:bg-surface-hover",
  destructive: "border-transparent bg-danger text-background enabled:hover:opacity-90",
  link: "border-transparent bg-transparent text-link underline underline-offset-4 enabled:hover:bg-surface-subtle",
};

export function buttonStyles(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn("relative inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-button border px-4 py-2 text-sm font-semibold leading-5 transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-wait aria-disabled:opacity-60", focusStyle,
    variants[variant], size === "sm" && "px-3", size === "icon" && "size-11 p-2", className);
}

export const inputStyles = cn("min-h-11 w-full min-w-0 rounded-input border border-control bg-surface px-3 py-2 text-base text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-muted-foreground aria-invalid:border-danger", focusStyle);
