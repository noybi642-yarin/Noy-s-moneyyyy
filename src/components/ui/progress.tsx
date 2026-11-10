import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  marker,
  className,
  tone = "auto",
}: {
  value: number; // percent, may exceed 100
  marker?: number | null; // percent position of a reference marker (e.g. expected pace)
  className?: string;
  tone?: "auto" | "sage" | "blush";
}) {
  const v = Math.max(0, Math.min(100, value));
  const color =
    tone === "blush"
      ? "bg-blush-ink/70"
      : tone === "sage"
        ? "bg-sage-ink"
        : value >= 100
          ? "bg-danger"
          : value >= 90
            ? "bg-amber"
            : value >= 70
              ? "bg-[#c9a85a]"
              : "bg-forest";
  return (
    <div
      className={cn("relative h-3 w-full overflow-hidden rounded-full bg-cream-deep", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", color)} style={{ width: `${v}%` }} />
      {marker !== undefined && marker !== null ? (
        <div
          className="absolute top-0 h-full w-0.5 bg-ink/40"
          style={{ insetInlineStart: `${Math.max(0, Math.min(100, marker))}%` }}
          title="קצב צפוי"
        />
      ) : null}
    </div>
  );
}
