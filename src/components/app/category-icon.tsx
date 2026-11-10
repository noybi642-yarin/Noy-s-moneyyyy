import {
  Baby,
  BookOpen,
  Car,
  CircleEllipsis,
  Coffee,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gem,
  Gift,
  GraduationCap,
  Heart,
  House,
  Music,
  PawPrint,
  PiggyBank,
  Plane,
  Repeat,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sofa,
  Sparkles,
  Stethoscope,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "shopping-cart": ShoppingCart,
  sparkles: Sparkles,
  baby: Baby,
  utensils: Utensils,
  gem: Gem,
  gift: Gift,
  sofa: Sofa,
  repeat: Repeat,
  "circle-ellipsis": CircleEllipsis,
  heart: Heart,
  car: Car,
  plane: Plane,
  book: BookOpen,
  dumbbell: Dumbbell,
  coffee: Coffee,
  house: House,
  shirt: Shirt,
  "paw-print": PawPrint,
  stethoscope: Stethoscope,
  gamepad: Gamepad2,
  music: Music,
  fuel: Fuel,
  "graduation-cap": GraduationCap,
  smartphone: Smartphone,
  "shopping-bag": ShoppingBag,
  "piggy-bank": PiggyBank,
};

export const CATEGORY_COLORS = [
  "#7C9A7E",
  "#5E7F6B",
  "#A9BFA3",
  "#D9A5B3",
  "#C98DA5",
  "#E7A9B2",
  "#E0B07A",
  "#C9A85A",
  "#A8916F",
  "#9DB8C9",
  "#7F9DB5",
  "#B49FCC",
  "#A3A39B",
  "#8C7B6B",
];

export function CategoryIcon({
  icon,
  color,
  size = "md",
  className,
}: {
  icon: string | undefined;
  color: string | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = (icon && CATEGORY_ICONS[icon]) || CircleEllipsis;
  const c = color ?? "#A3A39B";
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-2xl",
        size === "sm" && "size-8 rounded-xl [&_svg]:size-4",
        size === "md" && "size-10 [&_svg]:size-[18px]",
        size === "lg" && "size-12 [&_svg]:size-5",
        className,
      )}
      style={{ backgroundColor: `${c}26`, color: c }}
    >
      <Icon strokeWidth={1.8} />
    </span>
  );
}
