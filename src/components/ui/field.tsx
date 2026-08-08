import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.07em] text-subtle",
        className
      )}
      {...props}
    />
  );
}

const CONTROL =
  "w-full rounded-lg border border-border bg-app px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-primary/40 focus:ring-2 focus:ring-primary/25 disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(CONTROL, className)} {...props} />;
  }
);

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn(CONTROL, "cursor-pointer", className)} {...props} />;
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(CONTROL, "resize-none", className)} {...props} />;
});

export function FieldRow({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-subtle">{hint}</p> : null}
    </div>
  );
}

/** Segmented pill control — the app's filter idiom. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex gap-0.5 rounded-full border border-border bg-app p-1",
        className
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "cursor-pointer rounded-full px-3 py-1 text-[13px] transition",
            value === o.value
              ? "bg-primary font-semibold text-on-primary"
              : "text-muted-fg hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Multi-select chips, used for equipment and impediment regions. */
export function ChipToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full border px-3 py-1 text-[13px] transition",
        active
          ? "border-primary/50 bg-primary/12 text-primary"
          : "border-border-hi text-muted-fg hover:bg-muted hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex cursor-pointer items-center gap-2.5"
    >
      <span
        className={cn(
          "relative h-5 w-9 rounded-full border transition",
          checked ? "border-primary/50 bg-primary/30" : "border-border-hi bg-app"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all",
            checked ? "left-4.5 bg-primary" : "left-0.5 bg-subtle"
          )}
        />
      </span>
      <span className="text-sm">{label}</span>
    </button>
  );
}
