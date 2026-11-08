"use client";

import { Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive, RadioGroup as RadioPrimitive } from "radix-ui";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { focusStyle } from "./styles";

export type CheckboxProps = {
  id: string; label: ReactNode; checked?: boolean; defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void; disabled?: boolean; required?: boolean;
  name?: string; value?: string; className?: string; "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false";
};
export function Checkbox({ id, label, onCheckedChange, className, ...props }: CheckboxProps) {
  return (
    <label htmlFor={id} className={cn("flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground", className)}>
      <CheckboxPrimitive.Root {...props} id={id} onCheckedChange={(value) => onCheckedChange?.(value === true)} className={cn("flex size-5 shrink-0 items-center justify-center rounded-sm border border-control bg-surface text-background data-[state=checked]:border-brand data-[state=checked]:bg-brand disabled:cursor-not-allowed disabled:opacity-60", focusStyle)}>
        <CheckboxPrimitive.Indicator><Check aria-hidden="true" className="size-4" /></CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span className={cn("min-w-0 leading-relaxed", props.disabled && "text-muted-foreground")}>{label}</span>
    </label>
  );
}

export type RadioGroupProps = {
  label: string; value?: string; defaultValue?: string; onValueChange?: (value: string) => void;
  options: Array<{ value: string; label: ReactNode; disabled?: boolean }>;
  name?: string; disabled?: boolean; className?: string;
};
export function RadioGroup({ label, options, className, ...props }: RadioGroupProps) {
  const id = useId();
  return (
    <fieldset className={cn("min-w-0", className)}><legend id={id} className="mb-2 text-sm font-medium">{label}</legend>
      <RadioPrimitive.Root {...props} aria-labelledby={id} className="grid gap-1">
        {options.map((option, index) => <label key={option.value} htmlFor={`${id}-${index}`} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <RadioPrimitive.Item id={`${id}-${index}`} value={option.value} disabled={props.disabled || option.disabled} className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border border-control bg-surface data-[state=checked]:border-brand disabled:cursor-not-allowed disabled:opacity-60", focusStyle)}><RadioPrimitive.Indicator className="size-2.5 rounded-full bg-brand" /></RadioPrimitive.Item>
          <span className={cn("min-w-0 leading-relaxed", (props.disabled || option.disabled) && "text-muted-foreground")}>{option.label}</span>
        </label>)}
      </RadioPrimitive.Root>
    </fieldset>
  );
}
