"use client";

import { X } from "lucide-react";
import { AlertDialog, Dialog as DialogPrimitive, Tooltip as TooltipPrimitive, Toast as ToastPrimitive } from "radix-ui";
import type { MouseEvent, ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export type DialogProps = {
  trigger: ReactElement; title: ReactNode; description: ReactNode; closeLabel: string; children: ReactNode;
  open?: boolean; onOpenChange?: (open: boolean) => void; className?: string;
};

function ModalFrame({ trigger, title, description, closeLabel, children, open, onOpenChange, className, side }: DialogProps & { side?: "left" | "right" }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
      <DialogPrimitive.Content className={cn("fixed z-50 overflow-y-auto border border-border bg-surface p-6 text-foreground shadow-[var(--shadow-overlay)]",
        side ? "top-0 h-dvh w-[min(90vw,22rem)]" : "left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-panel",
        side === "left" && "left-0 border-y-0 border-l-0", side === "right" && "right-0 border-y-0 border-r-0", className)}>
        <DialogPrimitive.Title className="pr-10 text-xl font-semibold tracking-tight">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="mt-2 pr-8 text-sm leading-relaxed text-muted-foreground">{description}</DialogPrimitive.Description>
        <DialogPrimitive.Close asChild><Button variant="ghost" size="icon" className="absolute right-2 top-2" aria-label={closeLabel}><X aria-hidden="true" className="size-5" /></Button></DialogPrimitive.Close>
        <div className="mt-6 min-w-0">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

export function Dialog(props: DialogProps) { return <ModalFrame {...props} />; }
export function Sheet({ side = "left", ...props }: DialogProps & { side?: "left" | "right" }) { return <ModalFrame {...props} side={side} />; }
export const DialogClose = DialogPrimitive.Close;

export type TooltipProps = { trigger: ReactElement; content: ReactNode; side?: "top" | "right" | "bottom" | "left"; delayDuration?: number };
export function Tooltip({ trigger, content, side = "top", delayDuration = 400 }: TooltipProps) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration}><TooltipPrimitive.Root>
    <TooltipPrimitive.Trigger asChild>{trigger}</TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal><TooltipPrimitive.Content side={side} sideOffset={8} collisionPadding={12} className="z-60 max-w-64 rounded-input bg-foreground px-3 py-2 text-sm leading-relaxed text-background shadow-[var(--shadow-overlay)]">{content}<TooltipPrimitive.Arrow className="fill-foreground" /></TooltipPrimitive.Content></TooltipPrimitive.Portal>
  </TooltipPrimitive.Root></TooltipPrimitive.Provider>;
}

export type ConfirmationDialogProps = {
  trigger: ReactElement; title: ReactNode; description: ReactNode; confirmLabel: string; cancelLabel: string;
  // For asynchronous work, preventDefault() and keep open/busy controlled until
  // the caller has a confirmed result. The primitive does not confirm a server operation.
  onConfirm: (event: MouseEvent<HTMLButtonElement>) => void; open?: boolean; onOpenChange?: (open: boolean) => void;
  busy?: boolean; destructive?: boolean; children?: ReactNode;
};
export function ConfirmationDialog({ trigger, title, description, confirmLabel, cancelLabel, onConfirm, open, onOpenChange, busy, destructive = true, children }: ConfirmationDialogProps) {
  return <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
    <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
      <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-panel border border-border bg-surface p-6 shadow-[var(--shadow-overlay)]">
        <AlertDialog.Title className="text-xl font-semibold tracking-tight">{title}</AlertDialog.Title>
        <AlertDialog.Description className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</AlertDialog.Description>
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <AlertDialog.Cancel asChild><Button variant="secondary">{cancelLabel}</Button></AlertDialog.Cancel>
          <AlertDialog.Action asChild><Button variant={destructive ? "destructive" : "primary"} busy={busy} onClick={onConfirm}>{confirmLabel}</Button></AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
export const ConfirmDialog = ConfirmationDialog;

export type ToastProps = {
  open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; description?: ReactNode;
  label: string; closeLabel: string; duration?: number;
};
export function Toast({ open, onOpenChange, title, description, label, closeLabel, duration = 5000 }: ToastProps) {
  return <ToastPrimitive.Provider label={label} duration={duration} swipeDirection="right">
    <ToastPrimitive.Root open={open} onOpenChange={onOpenChange} className="relative grid gap-1 rounded-panel border border-control bg-surface p-5 pr-14 text-foreground shadow-[var(--shadow-overlay)]">
      <ToastPrimitive.Title className="text-sm font-semibold">{title}</ToastPrimitive.Title>
      {description && <ToastPrimitive.Description className="text-sm leading-relaxed text-muted-foreground">{description}</ToastPrimitive.Description>}
      <ToastPrimitive.Close asChild><Button variant="ghost" size="icon" className="absolute right-1 top-1" aria-label={closeLabel}><X aria-hidden="true" className="size-4" /></Button></ToastPrimitive.Close>
    </ToastPrimitive.Root>
    <ToastPrimitive.Viewport label={label} className="fixed bottom-4 right-4 z-70 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm list-none flex-col gap-3 outline-none" />
  </ToastPrimitive.Provider>;
}
