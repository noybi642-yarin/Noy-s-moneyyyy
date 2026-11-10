"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { BrandMark, BrandName } from "@/components/app/brand";
import { getSupabase, isCloudConfigured } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isCloudConfigured) return;
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="mb-8 flex items-center gap-3">
        <BrandMark />
        <BrandName tagline />
      </div>
      <div className="space-y-4 rounded-[28px] bg-card p-6 shadow-[var(--shadow-soft)] ring-1 ring-line/60">
        <h1 className="text-lg font-semibold">בחירת סיסמה חדשה</h1>
        {!isCloudConfigured ? (
          <p className="text-sm text-muted">איפוס סיסמה זמין רק כשהאפליקציה מחוברת ל-Supabase.</p>
        ) : !ready ? (
          <p className="text-sm text-muted">מאמתים את הקישור… אם הדף לא מתעדכן, כדאי לפתוח שוב את הקישור מהמייל.</p>
        ) : (
          <>
            <Field label="סיסמה חדשה (לפחות 8 תווים)">
              <Input type="password" dir="ltr" minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button
              className="w-full"
              disabled={busy || password.length < 8}
              onClick={async () => {
                setBusy(true);
                const { error } = await getSupabase().auth.updateUser({ password });
                setBusy(false);
                if (error) toast.error(error.message);
                else {
                  toast.success("הסיסמה עודכנה");
                  window.location.assign(window.location.origin);
                }
              }}
            >
              שמירה
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
