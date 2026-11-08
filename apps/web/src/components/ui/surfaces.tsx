import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) { return <div {...props} className={cn("min-w-0 rounded-panel border border-border bg-surface text-foreground", className)} />; }
export function CardHeader({ className, ...props }: ComponentProps<"div">) { return <div {...props} className={cn("grid gap-2 p-6", className)} />; }
export function CardTitle({ className, ...props }: ComponentProps<"h3">) { return <h3 {...props} className={cn("text-lg font-semibold leading-snug tracking-tight", className)} />; }
export function CardDescription({ className, ...props }: ComponentProps<"p">) { return <p {...props} className={cn("text-sm leading-relaxed text-muted-foreground", className)} />; }
export function CardContent({ className, ...props }: ComponentProps<"div">) { return <div {...props} className={cn("px-6 pb-6", className)} />; }
export function CardFooter({ className, ...props }: ComponentProps<"div">) { return <div {...props} className={cn("flex flex-wrap items-center gap-3 px-6 pb-6", className)} />; }

const badgeTones = {
  neutral: "bg-surface-subtle text-muted-foreground", brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success", warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger",
};
export type BadgeProps = ComponentProps<"span"> & { tone?: keyof typeof badgeTones };
export function Badge({ tone = "neutral", className, ...props }: BadgeProps) { return <span {...props} className={cn("inline-flex max-w-full items-center gap-1.5 rounded-input px-2.5 py-1 text-[0.8125rem] font-medium leading-5", badgeTones[tone], className)} />; }

const messageTones = {
  info: { style: "border-brand/20 bg-brand-soft text-brand", icon: Info },
  success: { style: "border-success/20 bg-success-soft text-success", icon: CircleCheck },
  warning: { style: "border-warning/20 bg-warning-soft text-warning", icon: TriangleAlert },
  danger: { style: "border-danger/20 bg-danger-soft text-danger", icon: CircleAlert },
};
export type StatusMessageProps = Omit<ComponentProps<"div">, "title"> & { tone?: keyof typeof messageTones; title?: ReactNode };
export function StatusMessage({ tone = "info", title, children, className, role, ...props }: StatusMessageProps) {
  const { style, icon: Icon } = messageTones[tone];
  return <div {...props} role={role ?? (tone === "danger" ? "alert" : "status")} className={cn("flex min-w-0 gap-3 rounded-input border p-4", style, className)}>
    <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
    <div className="min-w-0 text-sm leading-relaxed">{title && <p className="font-semibold">{title}</p>}{children && <div className={title ? "mt-1" : undefined}>{children}</div>}</div>
  </div>;
}
export const Alert = StatusMessage;

export function Skeleton({ className, ...props }: ComponentProps<"div">) { return <div aria-hidden="true" {...props} className={cn("h-4 animate-pulse rounded-input bg-surface-hover motion-reduce:animate-none", className)} />; }

export function Table({ className, containerClassName, ...props }: ComponentProps<"table"> & { containerClassName?: string }) {
  return <div className={cn("w-full min-w-0 overflow-x-auto rounded-panel border border-border", containerClassName)}><table {...props} className={cn("w-full border-collapse text-left text-sm", className)} /></div>;
}
export function TableCaption({ className, ...props }: ComponentProps<"caption">) { return <caption {...props} className={cn("caption-bottom px-4 py-3 text-left text-sm text-muted-foreground", className)} />; }
export function TableHeader({ className, ...props }: ComponentProps<"thead">) { return <thead {...props} className={cn("bg-surface-subtle", className)} />; }
export function TableBody({ className, ...props }: ComponentProps<"tbody">) { return <tbody {...props} className={cn("[&_tr:last-child]:border-0", className)} />; }
export function TableFooter({ className, ...props }: ComponentProps<"tfoot">) { return <tfoot {...props} className={cn("border-t border-border bg-surface-subtle font-medium", className)} />; }
export function TableRow({ className, ...props }: ComponentProps<"tr">) { return <tr {...props} className={cn("border-b border-border hover:bg-surface-subtle", className)} />; }
export function TableHead({ className, scope = "col", ...props }: ComponentProps<"th">) { return <th {...props} scope={scope} className={cn("px-4 py-3 align-top font-semibold text-foreground", className)} />; }
export function TableCell({ className, ...props }: ComponentProps<"td">) { return <td {...props} className={cn("px-4 py-3 align-top leading-relaxed", className)} />; }
