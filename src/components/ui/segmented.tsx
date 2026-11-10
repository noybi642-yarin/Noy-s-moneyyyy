"use client";

import { cn } from "@/lib/utils";

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "default",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
  size?: "default" | "sm";
}) {
  return (
    <div role="radiogroup" className={cn("flex gap-1 rounded-2xl bg-cream-deep p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl font-medium transition-all duration-200 cursor-pointer [&_svg]:size-4",
            size === "sm" ? "h-8 text-[13px]" : "h-10 text-sm",
            value === o.value ? "bg-card text-forest shadow-[var(--shadow-soft)]" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
