"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText, ChartPie, Ellipsis, House, Plus, CloudOff } from "lucide-react";
import { DataProvider, RootRenderProps, useData } from "./data-provider";
import { ErrorScreen, LoginScreen, Onboarding, Splash } from "./gate-screens";
import { cn } from "@/lib/utils";

export function AppRoot({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider gate={Gate}>
      <Shell>{children}</Shell>
    </DataProvider>
  );
}

function Gate(g: RootRenderProps) {
  if (g.phase === "auth") return <LoginScreen />;
  if (g.phase === "error") return <ErrorScreen error={g.error} retry={() => void g.retry()} />;
  if (g.needsOnboarding) return <Onboarding onDone={g.onboard} mode={g.mode} snapshot={g.snapshot} />;
  return <Splash />;
}

const NAV = [
  { href: "/", label: "בית", icon: House },
  { href: "/journal", label: "יומן הוצאות", icon: BookOpenText },
  { href: "/new", label: "הוצאה חדשה", icon: Plus, primary: true },
  { href: "/insights", label: "תובנות", icon: ChartPie },
  { href: "/more", label: "עוד", icon: Ellipsis },
];

const MORE_ROUTES = ["/more", "/what-if", "/card", "/recurring", "/categories", "/settings"];

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { mode } = useData();
  return (
    <div className="min-h-dvh">
      {mode === "local" ? (
        <div className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-amber-soft px-4 py-1.5 text-center text-[12px] font-medium text-amber">
          <CloudOff className="size-3.5 shrink-0" />
          מצב מקומי — הנתונים נשמרים רק בדפדפן הזה ואינם מגובים בענן
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-2xl px-4 pb-32 pt-4 sm:px-6">
        {children}
      </main>
      <nav
        aria-label="ניווט ראשי"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-card/90 backdrop-blur-xl"
      >
        <ul className="mx-auto flex max-w-2xl items-end justify-around px-2 pt-1.5">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : item.href === "/more"
                  ? MORE_ROUTES.some((r) => pathname.startsWith(r))
                  : pathname.startsWith(item.href);
            const Icon = item.icon;
            if (item.primary) {
              return (
                <li key={item.href} className="-mt-6 flex flex-1 justify-center">
                  <Link
                    href={item.href}
                    aria-label={item.label}
                    className={cn(
                      "flex flex-col items-center gap-1",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-14 place-items-center rounded-[20px] bg-forest text-forest-ink shadow-[var(--shadow-lift)] ring-4 ring-cream transition active:scale-95",
                        active && "bg-[#22382b]",
                      )}
                    >
                      <Icon className="size-7" strokeWidth={2.2} />
                    </span>
                    <span className="pb-2 text-[11px] font-medium text-forest">{item.label}</span>
                  </Link>
                </li>
              );
            }
            return (
              <li key={item.href} className="flex flex-1 justify-center">
                <Link
                  href={item.href}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-medium transition",
                    active ? "text-forest" : "text-muted hover:text-ink",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.7} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
