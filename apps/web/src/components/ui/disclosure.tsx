"use client";

import { ChevronDown } from "lucide-react";
import { Accordion as AccordionPrimitive, Tabs as TabsPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { focusStyle } from "./styles";

export type TabsProps = {
  label: string; items: Array<{ value: string; label: ReactNode; content: ReactNode; disabled?: boolean }>;
  defaultValue?: string; value?: string; onValueChange?: (value: string) => void; className?: string; keepMounted?: boolean;
};
export function Tabs({ label, items, defaultValue, className, keepMounted, ...props }: TabsProps) {
  return <TabsPrimitive.Root {...props} defaultValue={defaultValue ?? items[0]?.value} className={cn("min-w-0", className)}>
    <TabsPrimitive.List aria-label={label} className="flex flex-wrap gap-1 border-b border-border pb-2">
      {items.map((item) => <TabsPrimitive.Trigger key={item.value} value={item.value} disabled={item.disabled} className={cn("min-h-11 rounded-button px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-subtle data-[state=active]:bg-brand-soft data-[state=active]:text-brand disabled:cursor-not-allowed disabled:opacity-60", focusStyle)}>{item.label}</TabsPrimitive.Trigger>)}
    </TabsPrimitive.List>
    {items.map((item) => <TabsPrimitive.Content key={item.value} value={item.value} forceMount={keepMounted || undefined} className={cn("mt-5 min-w-0 rounded-input data-[state=inactive]:hidden", focusStyle)}>{item.content}</TabsPrimitive.Content>)}
  </TabsPrimitive.Root>;
}

export type AccordionProps = { items: Array<{ value: string; title: ReactNode; content: ReactNode }>; defaultValue?: string; className?: string };
export function Accordion({ items, defaultValue, className }: AccordionProps) {
  return <AccordionPrimitive.Root type="single" collapsible defaultValue={defaultValue} className={cn("divide-y divide-border", className)}>
    {items.map((item) => <AccordionPrimitive.Item key={item.value} value={item.value}>
      <AccordionPrimitive.Header><AccordionPrimitive.Trigger className={cn("group flex min-h-12 w-full items-center justify-between gap-4 rounded-input py-3 text-left text-base font-medium", focusStyle)}><span className="min-w-0">{item.title}</span><ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" /></AccordionPrimitive.Trigger></AccordionPrimitive.Header>
      <AccordionPrimitive.Content className="pb-4 leading-relaxed text-muted-foreground">{item.content}</AccordionPrimitive.Content>
    </AccordionPrimitive.Item>)}
  </AccordionPrimitive.Root>;
}
