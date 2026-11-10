import type { ChangeSet, Snapshot } from "../types";

export interface DataStore {
  readonly mode: "cloud" | "local";
  load(): Promise<Snapshot>;
  /** Apply a change set atomically. */
  apply(cs: ChangeSet): Promise<void>;
}
