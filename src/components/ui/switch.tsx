"use client";

import * as React from "react";
import { Switch as S } from "radix-ui";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      dir="rtl"
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full bg-line transition-colors data-[state=checked]:bg-forest outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-6 rounded-full bg-white shadow transition-transform translate-x-[-2px] data-[state=checked]:translate-x-[-22px]" />
    </S.Root>
  );
}
