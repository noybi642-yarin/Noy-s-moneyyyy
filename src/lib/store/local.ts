import { applyChangeSet, ChangeSet, emptySnapshot, Snapshot } from "../types";
import type { DataStore } from "./index";

/**
 * Local development mode: data lives ONLY in this browser's localStorage.
 * It is not synced or backed up anywhere. The UI shows a permanent banner saying so.
 */
const KEY = "noys-moneyyyyyy:local:v1";

export class LocalStore implements DataStore {
  readonly mode = "local" as const;

  async load(): Promise<Snapshot> {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return emptySnapshot();
      return { ...emptySnapshot(), ...(JSON.parse(raw) as Partial<Snapshot>) };
    } catch {
      throw new Error("לא ניתן לקרוא את הנתונים המקומיים בדפדפן");
    }
  }

  async apply(cs: ChangeSet): Promise<void> {
    const current = await this.load();
    const next = applyChangeSet(current, cs);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  }

  static clear() {
    window.localStorage.removeItem(KEY);
  }
}
