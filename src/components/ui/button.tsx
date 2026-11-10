import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-[15px] font-medium transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)] [&_svg]:size-[18px] [&_svg]:shrink-0 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default: "bg-forest text-forest-ink shadow-[var(--shadow-lift)] hover:bg-[#263e30]",
        secondary: "bg-sage-soft text-forest hover:bg-[#dbe6d6]",
        blush: "bg-blush text-blush-ink hover:bg-[#efcdd1]",
        outline: "border border-line bg-card text-ink hover:bg-cream-deep",
        ghost: "text-ink hover:bg-cream-deep",
        danger: "bg-danger text-white hover:bg-[#a34536]",
        "danger-ghost": "text-danger hover:bg-danger-soft",
      },
      size: {
        default: "h-12 px-5",
        sm: "h-9 rounded-xl px-3 text-sm",
        lg: "h-14 px-6 text-base",
        icon: "size-10 rounded-full",
        "icon-sm": "size-8 rounded-full [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { buttonVariants };
