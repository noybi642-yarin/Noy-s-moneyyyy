import type { SupabaseClient } from "@supabase/supabase-js";
import { ChangeSet, emptySnapshot, Settings, Snapshot, TableName, TABLES } from "../types";
import type { DataStore } from "./index";

const PAGE = 1000;

async function fetchAll<T>(sb: SupabaseClient, table: TableName): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select("*").order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function stripUser<T extends Record<string, unknown>>(row: T): T {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user_id, ...rest } = row;
  return rest as T;
}

export class SupabaseStore implements DataStore {
  readonly mode = "cloud" as const;
  constructor(private sb: SupabaseClient) {}

  async load(): Promise<Snapshot> {
    const snap = emptySnapshot();
    const [settingsRes, ...tables] = await Promise.all([
      this.sb.from("settings").select("*").maybeSingle(),
      ...TABLES.map((t) => fetchAll<Record<string, unknown>>(this.sb, t)),
    ]);
    if (settingsRes.error) throw new Error(settingsRes.error.message);
    snap.settings = settingsRes.data ? (stripUser(settingsRes.data) as unknown as Settings) : null;
    TABLES.forEach((t, i) => {
      (snap as unknown as Record<string, unknown[]>)[t] = (tables[i] as Record<string, unknown>[]).map(stripUser);
    });
    return snap;
  }

  async apply(cs: ChangeSet): Promise<void> {
    const { error } = await this.sb.rpc("apply_changes", { p: cs });
    if (error) throw new Error(error.message);
  }
}
