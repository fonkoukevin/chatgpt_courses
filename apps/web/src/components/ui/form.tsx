import { ChevronDown, Search } from "lucide-react";
import { cloneElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { inputStyles } from "./styles";

type ControlProps = { id?: string; required?: boolean; "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling"; "aria-describedby"?: string };
export type FormFieldProps = {
  id: string; label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean;
  children: ReactElement<ControlProps>; className?: string; labelClassName?: string;
};

export function FormField({ id, label, hint, error, required, children, className, labelClassName }: FormFieldProps) {
  const describedBy = [...new Set([children.props["aria-describedby"], hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean))].join(" ") || undefined;
  return (
    <div className={cn("grid min-w-0 gap-2", className)}>
      <label htmlFor={id} className={cn("text-sm font-medium text-foreground", labelClassName)}>{label}{required && <span aria-hidden="true" className="ml-1 text-danger">*</span>}</label>
      {cloneElement(children, { id, required: required || children.props.required, "aria-invalid": error ? true : children.props["aria-invalid"], "aria-describedby": describedBy })}
      {hint && <p id={`${id}-hint`} className="text-sm leading-relaxed text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

export type InputProps = ComponentProps<"input"> & { startIcon?: ReactNode };
export function Input({ className, startIcon, ...props }: InputProps) {
  const input = <input {...props} className={cn(inputStyles, startIcon && "pl-10", className)} />;
  if (!startIcon) return input;
  return <span className="relative block min-w-0"><span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{startIcon}</span>{input}</span>;
}

export function TextArea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(inputStyles, "min-h-32 resize-y leading-relaxed", className)} />;
}
export const Textarea = TextArea;

export type SelectProps = ComponentProps<"select"> & { options?: Array<{ value: string; label: string; disabled?: boolean }> };
export function Select({ className, children, options, ...props }: SelectProps) {
  return <span className="relative block min-w-0"><select {...props} className={cn(inputStyles, "appearance-none pr-10", className)}>{options ? options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>) : children}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /></span>;
}

export type SearchFieldProps = Omit<InputProps, "id" | "type" | "startIcon"> & { id: string; label: ReactNode; hint?: ReactNode; error?: ReactNode; labelHidden?: boolean };
export function SearchField({ id, label, hint, error, labelHidden, ...props }: SearchFieldProps) {
  return <FormField id={id} label={label} hint={hint} error={error} labelClassName={labelHidden ? "sr-only" : undefined}><Input {...props} type="search" startIcon={<Search className="size-4" />} /></FormField>;
}
