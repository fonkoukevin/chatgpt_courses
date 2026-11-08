"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Link } from "./link";
import { buttonStyles } from "./styles";

type PaginationBase = { page: number; totalPages: number; label: string; previousLabel: string; nextLabel: string; pageLabel?: string; className?: string };
export type PaginationProps = PaginationBase & (
  { onPageChange: (page: number) => void; hrefForPage?: never } |
  { hrefForPage: (page: number) => string; onPageChange?: never }
);

export function Pagination({ page, totalPages, label, previousLabel, nextLabel, pageLabel, className, onPageChange, hrefForPage }: PaginationProps) {
  if (!Number.isInteger(page) || !Number.isInteger(totalPages) || page < 1 || totalPages < page) throw new Error("Invalid pagination bounds.");
  const pages = [...new Set([1, page - 1, page, page + 1, totalPages].filter((value) => value >= 1 && value <= totalPages))].sort((a, b) => a - b);
  const item = (target: number, text: ReactNode, accessibleLabel: string, current = false) => {
    const classes = cn(current && "border-brand bg-brand-soft text-brand");
    return hrefForPage
      ? <Link href={hrefForPage(target)} aria-label={accessibleLabel} aria-current={current ? "page" : undefined} className={buttonStyles("secondary", "icon", classes)}>{text}</Link>
      : <Button variant="secondary" size="icon" className={classes} aria-label={accessibleLabel} aria-current={current ? "page" : undefined} onClick={() => onPageChange?.(target)}>{text}</Button>;
  };
  return <nav aria-label={label} className={className}><ul className="flex flex-wrap items-center gap-1">
    <li>{page > 1 ? item(page - 1, <ChevronLeft aria-hidden="true" className="size-4" />, previousLabel) : <Button variant="secondary" size="icon" disabled aria-label={previousLabel}><ChevronLeft aria-hidden="true" className="size-4" /></Button>}</li>
    {pages.map((value, index) => <li key={value} className="flex items-center gap-1">{index > 0 && value > pages[index - 1] + 1 && <span aria-hidden="true" className="px-1 text-muted-foreground">…</span>}{item(value, value, pageLabel?.replaceAll("{page}", String(value)).replaceAll("{total}", String(totalPages)) ?? String(value), value === page)}</li>)}
    <li>{page < totalPages ? item(page + 1, <ChevronRight aria-hidden="true" className="size-4" />, nextLabel) : <Button variant="secondary" size="icon" disabled aria-label={nextLabel}><ChevronRight aria-hidden="true" className="size-4" /></Button>}</li>
  </ul></nav>;
}
