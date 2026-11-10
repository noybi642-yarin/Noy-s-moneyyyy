"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { getSupabase, isCloudConfigured } from "@/lib/supabase";
import type { DataStore } from "@/lib/store";
import { LocalStore } from "@/lib/store/local";
import { SupabaseStore } from "@/lib/store/supabase";
import { applyChangeSet, Category, ChangeSet, emptySnapshot, isChangeSetEmpty, Settings, Snapshot } from "@/lib/types";
import { todayInJerusalem, ISODate } from "@/lib/dates";
import { cycleKeyFor, CycleKey } from "@/lib/cycle";
import { Allocation, allocations as computeAllocations } from "@/lib/finance/budget";
import { generateOccurrences } from "@/lib/finance/recurring";
import { DomainError } from "@/lib/finance/mutations";

export interface DataCtx {
  mode: "cloud" | "local";
  snapshot: Snapshot;
  settings: Settings;
  today: ISODate;
  currentCycle: CycleKey;
  viewCycle: CycleKey;
  setViewCycle: (c: CycleKey) => void;
  allocations: Allocation[];
  categories: Category[]; // sorted
  categoryById: Map<string, Category>;
  /** Build a change set from the latest data and persist it atomically. */
  run: (build: (snap: Snapshot, settings: Settings) => ChangeSet, opts?: { success?: string }) => Promise<boolean>;
  reload: () => Promise<void>;
  userEmail: string | null;
  signOut: () => Promise<void>;
}

const Ctx = createContext<DataCtx | null>(null);

export function useData(): DataCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData outside provider");
  return v;
}

type Phase = "boot" | "auth" | "loading" | "ready" | "error";

export interface RootRenderProps {
  phase: Phase;
  error: string | null;
  retry: () => void | Promise<void>;
  needsOnboarding: boolean;
  onboard: (cs: ChangeSet) => Promise<boolean>;
  mode: "cloud" | "local";
  snapshot: Snapshot;
}

export function DataProvider({
  children,
  gate: Gate,
}: {
  children: React.ReactNode;
  /** Rendered instead of the app while booting, signed out, failing or onboarding. */
  gate: React.ComponentType<RootRenderProps>;
}) {
  const mode: "cloud" | "local" = isCloudConfigured ? "cloud" : "local";
  const [phase, setPhase] = useState<Phase>("boot");
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const snapRef = useRef<Snapshot>(snapshot);
  const storeRef = useRef<DataStore | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const [session, setSession] = useState<Session | null>(null);
  // The real date is read on mount (not during prerender); nothing date-dependent renders before that.
  const [today, setToday] = useState<ISODate | null>(null);
  const [viewCycleState, setViewCycle] = useState<CycleKey | null>(null);

  const commit = useCallback((next: Snapshot) => {
    snapRef.current = next;
    setSnapshot(next);
  }, []);

  const load = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;
    setPhase((p) => (p === "ready" ? p : "loading"));
    try {
      const snap = await store.load();
      commit(snap);
      setError(null);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [commit]);

  // Boot: read today's date, choose the store and authenticate.
  useEffect(() => {
    const d = todayInJerusalem();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the clock is an external system, read once on mount
    setToday(d);
    setViewCycle(cycleKeyFor(d));
    if (mode === "local") {
      storeRef.current = new LocalStore();
      void load();
      return;
    }
    const sb = getSupabase();
    let active = true;
    sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) {
        storeRef.current = new SupabaseStore(sb);
        void load();
      } else {
        setPhase("auth");
      }
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      if (!active) return;
      setSession(s);
      if (event === "SIGNED_IN" && s && !storeRef.current) {
        storeRef.current = new SupabaseStore(sb);
        // Defer: calling Supabase from inside this callback can deadlock the auth lock.
        setTimeout(() => void load(), 0);
      }
      if (event === "SIGNED_OUT") {
        storeRef.current = null;
        commit(emptySnapshot());
        setPhase("auth");
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [mode, load, commit]);

  // Keep "today" correct across midnight (Asia/Jerusalem) while the app stays open.
  useEffect(() => {
    const t = setInterval(() => {
      const d = todayInJerusalem();
      setToday((prev) => {
        if (prev && prev !== d) {
          setViewCycle((vc) => (vc === cycleKeyFor(prev) ? cycleKeyFor(d) : vc));
        }
        return d;
      });
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  const persist = useCallback(
    async (cs: ChangeSet): Promise<void> => {
      const store = storeRef.current;
      if (!store) throw new Error("not ready");
      commit(applyChangeSet(snapRef.current, cs)); // optimistic
      const p = queueRef.current.then(() => store.apply(cs));
      queueRef.current = p.catch(() => {});
      try {
        await p;
      } catch (e) {
        await load(); // restore the true state from storage
        throw e;
      }
    },
    [commit, load],
  );

  const run = useCallback<DataCtx["run"]>(
    async (build, opts) => {
      let cs: ChangeSet;
      try {
        const snap = snapRef.current;
        if (!snap.settings) throw new DomainError("ההגדרות לא נטענו");
        cs = build(snap, snap.settings);
      } catch (e) {
        toast.error(e instanceof DomainError ? e.message : "משהו השתבש, אפשר לנסות שוב");
        if (!(e instanceof DomainError)) console.error(e);
        return false;
      }
      if (isChangeSetEmpty(cs)) return true;
      try {
        await persist(cs);
        if (opts?.success) toast.success(opts.success);
        return true;
      } catch (e) {
        console.error(e);
        toast.error("השמירה נכשלה — הנתונים לא השתנו. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב.");
        return false;
      }
    },
    [persist],
  );

  // Generate recurring obligations for the relevant cycles (idempotent, no duplicates).
  const settingsReady = phase === "ready" && Boolean(snapshot.settings?.onboarded);
  useEffect(() => {
    if (!settingsReady || !today) return;
    const cs = generateOccurrences(snapRef.current, today);
    if (!isChangeSetEmpty(cs)) {
      persist(cs).catch((e) => console.error("recurring generation failed", e));
    }
  }, [settingsReady, today, snapshot.recurring_rules, persist]);

  const signOut = useCallback(async () => {
    if (mode === "cloud") await getSupabase().auth.signOut();
  }, [mode]);

  const onboard = useCallback(
    async (cs: ChangeSet) => {
      try {
        await persist(cs);
        return true;
      } catch (e) {
        console.error(e);
        toast.error("השמירה נכשלה, אפשר לנסות שוב");
        return false;
      }
    },
    [persist],
  );

  const policy = snapshot.settings?.accounting_policy ?? "cash_flow";
  const allocs = useMemo(
    () => computeAllocations(snapshot, policy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.expenses, snapshot.installments, policy],
  );
  const categories = useMemo(
    () => [...snapshot.categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "he")),
    [snapshot.categories],
  );
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const needsOnboarding = phase === "ready" && !snapshot.settings?.onboarded;
  if (phase !== "ready" || needsOnboarding || !today || !viewCycleState) {
    return (
      <Gate phase={phase === "ready" && (!today || !viewCycleState) ? "loading" : phase} error={error} retry={load} needsOnboarding={needsOnboarding} onboard={onboard} mode={mode} snapshot={snapshot} />
    );
  }

  const value: DataCtx = {
    mode,
    snapshot,
    settings: snapshot.settings!,
    today,
    currentCycle: cycleKeyFor(today),
    viewCycle: viewCycleState,
    setViewCycle,
    allocations: allocs,
    categories,
    categoryById,
    run,
    reload: load,
    userEmail: session?.user.email ?? null,
    signOut,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
