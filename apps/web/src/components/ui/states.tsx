"use client";

import { CircleAlert, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export type EmptyStateProps = { title: ReactNode; description?: ReactNode; children?: ReactNode; icon?: ReactNode; className?: string };
export function EmptyState({ title, description, children, icon, className }: EmptyStateProps) {
  return <div className={cn("grid justify-items-center gap-3 rounded-panel border border-dashed border-control bg-surface p-6 text-center", className)}>
    <span aria-hidden="true" className="text-muted-foreground">{icon ?? <Inbox className="size-6" />}</span>
    <p className="text-base font-semibold">{title}</p>
    {description && <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>}
    {children && <div className="mt-1 flex flex-wrap justify-center gap-3">{children}</div>}
  </div>;
}

export type ErrorStateProps = Omit<EmptyStateProps, "icon"> & { retryLabel?: string; onRetry?: () => void };
export function ErrorState({ title, description, retryLabel, onRetry, children, className }: ErrorStateProps) {
  return <div role="alert" className={cn("grid justify-items-start gap-3 rounded-panel border border-danger/30 bg-danger-soft p-6", className)}>
    <CircleAlert aria-hidden="true" className="size-6 text-danger" />
    <p className="font-semibold text-danger">{title}</p>
    {description && <p className="text-sm leading-relaxed text-foreground">{description}</p>}
    {(children || (retryLabel && onRetry)) && <div className="flex flex-wrap gap-3">{retryLabel && onRetry && <Button variant="secondary" onClick={onRetry}>{retryLabel}</Button>}{children}</div>}
  </div>;
}
