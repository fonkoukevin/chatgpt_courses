import NextLink from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { buttonStyles, focusStyle } from "./styles";

export type LinkProps = ComponentProps<typeof NextLink> & { variant?: "inline" | "nav" | "button" };

export function Link({ variant = "inline", className, ...props }: LinkProps) {
  return <NextLink {...props} className={cn(
    "rounded-input text-link underline-offset-4", focusStyle,
    variant === "inline" && "underline hover:decoration-2",
    variant === "nav" && "inline-flex min-h-11 items-center gap-2 px-3 py-2 text-sm no-underline hover:bg-surface-subtle aria-[current=page]:bg-brand-soft aria-[current=page]:font-semibold aria-[current=page]:text-brand",
    variant === "button" && buttonStyles(), className,
  )} />;
}
