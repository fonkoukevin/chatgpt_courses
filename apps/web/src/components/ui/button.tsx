"use client";

import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps, MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { buttonStyles, type ButtonSize, type ButtonVariant } from "./styles";

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  loadingLabel?: string;
  asChild?: boolean;
};

export function Button({ variant = "primary", size = "md", busy, loadingLabel, asChild = false, className, children, disabled, onClick, type = "button", ...props }: ButtonProps) {
  const blocked = disabled || busy || props["aria-disabled"] === true || props["aria-disabled"] === "true";
  const click = (event: MouseEvent<HTMLButtonElement>) => {
    if (blocked) { event.preventDefault(); return; }
    onClick?.(event);
  };
  const classes = buttonStyles(variant, size, cn(busy !== undefined && !asChild && "pl-10", className));
  if (asChild) {
    return <Slot.Root {...props} className={classes} aria-disabled={blocked || undefined} aria-busy={busy || undefined} onClick={click}>{children}</Slot.Root>;
  }
  return (
    <button {...props} type={type} disabled={disabled} aria-disabled={busy || props["aria-disabled"] || undefined} aria-busy={busy || undefined} className={classes} onClick={click}>
      {busy !== undefined && <LoaderCircle aria-hidden="true" className={cn("absolute left-3 size-4 animate-spin motion-reduce:animate-none", !busy && "invisible")} />}
      <span className="grid min-w-0">
        <span className={cn("col-start-1 row-start-1 inline-flex items-center justify-center gap-2", busy && loadingLabel && "invisible")} aria-hidden={busy && loadingLabel ? true : undefined}>{children}</span>
        {loadingLabel && <span className={cn("col-start-1 row-start-1 inline-flex items-center justify-center gap-2", !busy && "invisible")} aria-hidden={!busy}>{loadingLabel}</span>}
      </span>
    </button>
  );
}
