"use client";

import Link from "next/link";
import { ChevronLeft, CreditCard, Repeat, Settings, Tags, WandSparkles } from "lucide-react";
import { useData } from "@/components/app/data-provider";
import { PageHeader } from "@/components/app/page-header";
import { BrandMark, BrandName } from "@/components/app/brand";
import { Card } from "@/components/ui/card";

const ITEMS = [
  { href: "/what-if", icon: WandSparkles, title: "מה אם אקנה?", desc: "סימולציה ורשימת רכישות מתוכננות", tone: "blush" },
  { href: "/card", icon: CreditCard, title: "תחזית אשראי", desc: "החיוב הבא, תשלומים ועסקאות פתוחות" },
  { href: "/recurring", icon: Repeat, title: "הוצאות קבועות", desc: "גן, מנויים, ביטוחים והוראות קבע" },
  { href: "/categories", icon: Tags, title: "קטגוריות", desc: "עריכה, סדר ותקציב לקטגוריה" },
  { href: "/settings", icon: Settings, title: "הגדרות", desc: "תקציב, שיטת חישוב, כרטיס, התראות, ייצוא וחשבון" },
];

export default function MorePage() {
  const { mode, userEmail } = useData();
  return (
    <div className="space-y-4">
      <PageHeader title="עוד" />
      <Card className="divide-y divide-line/60 px-2">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} className="flex items-center gap-3 px-2 py-4 transition active:opacity-70">
              <span className={`grid size-10 place-items-center rounded-2xl ${it.tone === "blush" ? "bg-blush-soft text-blush-ink" : "bg-sage-soft text-forest"}`}>
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{it.title}</span>
                <span className="block truncate text-xs text-muted">{it.desc}</span>
              </span>
              <ChevronLeft className="size-4 text-muted" />
            </Link>
          );
        })}
      </Card>
      <div className="flex flex-col items-center gap-3 pt-6 text-center">
        <BrandMark className="size-12" />
        <BrandName tagline />
        <p className="text-xs text-muted">{mode === "cloud" ? `מחובר · ${userEmail ?? ""}` : "מצב מקומי · ללא גיבוי בענן"}</p>
      </div>
    </div>
  );
}
