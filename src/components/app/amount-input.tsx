"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/** Large, decimal-keyboard amount field. Value is the raw typed string (parsed to agorot by the caller). */
export const AmountInput = forwardRef<
  HTMLInputElement,
  { value: string; onChange: (v: string) => void; autoFocus?: boolean; className?: string; id?: string; size?: "lg" | "md" }
>(function AmountInput({ value, onChange, autoFocus, className, id, size = "lg" }, ref) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1 rounded-3xl bg-card ring-1 ring-line transition focus-within:ring-4 focus-within:ring-[var(--ring)]",
        size === "lg" ? "px-5 py-4" : "px-4 py-2",
        className,
      )}
      dir="ltr"
    >
      <span className={cn("font-brand text-muted", size === "lg" ? "text-3xl" : "text-xl")}>₪</span>
      <input
        ref={ref}
        id={id}
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="next"
        placeholder="0"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
        className={cn(
          "w-full min-w-0 bg-transparent text-center font-semibold tabular-nums text-ink outline-none placeholder:text-line",
          size === "lg" ? "text-5xl" : "text-2xl",
        )}
        aria-label="סכום בשקלים"
      />
    </div>
  );
});
