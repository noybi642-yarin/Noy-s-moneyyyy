import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/icons/icon.svg" alt="" aria-hidden className={cn("size-10 rounded-[12px]", className)} />;
}

export function BrandName({ className, tagline = false }: { className?: string; tagline?: boolean }) {
  return (
    <div className={cn("leading-none", className)} dir="ltr">
      <div className="font-brand text-[22px] font-medium italic tracking-tight text-forest">
        Noy&apos;s money<span className="text-blush-ink">yyyyy</span>
      </div>
      {tagline ? <div className="mt-1.5 font-brand text-[13px] italic text-muted">My money. My rules.</div> : null}
    </div>
  );
}
