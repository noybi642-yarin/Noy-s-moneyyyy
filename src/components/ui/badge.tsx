import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", {
  variants: {
    variant: {
      default: "bg-cream-deep text-muted",
      sage: "bg-sage-soft text-sage-ink",
      blush: "bg-blush-soft text-blush-ink",
      amber: "bg-amber-soft text-amber",
      danger: "bg-danger-soft text-danger",
      forest: "bg-forest text-forest-ink",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
