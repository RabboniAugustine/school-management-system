/**
 * Offline write queue for field work (attendance and score entry on a weak connection).
 *
 * Writes that fail because the device is offline are stored in IndexedDB and replayed in order when the
 * connection returns. Each entry is an idempotent upsert, so replaying twice is harmless, and entries are
 * tagged with their owner so one user's pending work is never sent under another user's login.
 * Only the tables listed in QUEUEABLE can be queued.
 */
export const QUEUEABLE = ["student_attendance", "scores"] as const;
export type QueueTable = (typeof QUEUEABLE)[number];

export type Mutation = {
  id: string;
  owner: string;
  schoolId: string;
  table: QueueTable;
  rows: Record<string, unknown>[];
  onConflict: string;
  label: string;
  createdAt: number;
  status: "pending" | "failed";
  error?: string;
};

export type UpsertClient = {
  from(table: string): { upsert(rows: unknown, options: { onConflict: string }): PromiseLike<{ error: { message?: string; code?: string } | null }> };
};

const DB_NAME = "sms-offline";
const STORE = "mutations";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req.result); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  }));
}

export function isNetworkError(error: { message?: string; code?: string } | null | undefined): boolean {
  const m = (error?.message ?? "").toLowerCase();
  return m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed") || m.includes("fetch failed") || m.includes("network request failed");
}

export async function enqueue(input: Omit<Mutation, "id" | "createdAt" | "status" | "error">): Promise<Mutation> {
  if (!QUEUEABLE.includes(input.table)) throw new Error(`Table ${input.table} cannot be queued offline`);
  if (input.rows.length === 0 || input.rows.length > 500) throw new Error("A queued change must contain between 1 and 500 rows");
  const m: Mutation = { ...input, id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, createdAt: Date.now(), status: "pending" };
  await tx("readwrite", (s) => s.put(m));
  return m;
}

export async function list(owner: string): Promise<Mutation[]> {
  const all = await tx<Mutation[]>("readonly", (s) => s.getAll());
  return all.filter((m) => m.owner === owner).sort((a, b) => a.createdAt - b.createdAt);
}

export async function remove(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

async function markFailed(m: Mutation, error: string): Promise<void> {
  await tx("readwrite", (s) => s.put({ ...m, status: "failed", error }));
}

export async function retryFailed(owner: string): Promise<void> {
  for (const m of await list(owner)) if (m.status === "failed") await tx("readwrite", (s) => s.put({ ...m, status: "pending", error: undefined }));
}

export type FlushResult = { synced: number; failed: number; stoppedOffline: boolean };

/** Replays pending changes oldest first. Stops at the first network error; other errors are kept as "failed" for review. */
export async function flush(db: UpsertClient, owner: string): Promise<FlushResult> {
  const result: FlushResult = { synced: 0, failed: 0, stoppedOffline: false };
  for (const m of await list(owner)) {
    if (m.status !== "pending") continue;
    const { error } = await db.from(m.table).upsert(m.rows, { onConflict: m.onConflict });
    if (!error) { await remove(m.id); result.synced++; continue; }
    if (isNetworkError(error)) { result.stoppedOffline = true; break; }
    await markFailed(m, error.code === "42501" ? "You no longer have permission to save this change." : (error.message ?? "The server rejected this change."));
    result.failed++;
  }
  return result;
}
