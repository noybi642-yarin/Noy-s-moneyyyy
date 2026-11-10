import { formatILS } from "@/lib/money";
import { cn } from "@/lib/utils";

export function Money({ value, className, signed }: { value: number; className?: string; signed?: boolean }) {
  const text = signed && value > 0 ? `+${formatILS(value)}` : formatILS(value);
  return <span className={cn("num", className)}>{text}</span>;
}
