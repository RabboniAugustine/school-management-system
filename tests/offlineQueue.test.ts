import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { enqueue, flush, isNetworkError, list, retryFailed, type UpsertClient } from "../src/lib/offlineQueue";

type Call = { table: string; rows: unknown; onConflict: string };
function fakeDb(responses: ({ message?: string; code?: string } | null)[], calls: Call[]): UpsertClient {
  let i = 0;
  return { from: (table: string) => ({ upsert: async (rows: unknown, o: { onConflict: string }) => { calls.push({ table, rows, onConflict: o.onConflict }); return { error: responses[Math.min(i++, responses.length - 1)] }; } }) };
}
const base = { schoolId: "s1", onConflict: "school_id,enrollment_id,school_day", label: "Attendance" };

test("replays queued changes oldest first, then empties the queue", async () => {
  await enqueue({ ...base, owner: "a@x.com", table: "student_attendance", rows: [{ n: 1 }] });
  await enqueue({ ...base, owner: "a@x.com", table: "scores", rows: [{ n: 2 }], onConflict: "school_id,assessment_id,enrollment_id" });
  const calls: Call[] = [];
  const r = await flush(fakeDb([null], calls), "a@x.com");
  assert.deepEqual(r, { synced: 2, failed: 0, stoppedOffline: false });
  assert.deepEqual(calls.map((c) => c.table), ["student_attendance", "scores"]);
  assert.equal((await list("a@x.com")).length, 0);
});

test("keeps everything when the network is still down, and retries later", async () => {
  await enqueue({ ...base, owner: "b@x.com", table: "student_attendance", rows: [{ n: 1 }] });
  await enqueue({ ...base, owner: "b@x.com", table: "student_attendance", rows: [{ n: 2 }] });
  const calls: Call[] = [];
  const down = await flush(fakeDb([{ message: "TypeError: Failed to fetch" }], calls), "b@x.com");
  assert.deepEqual(down, { synced: 0, failed: 0, stoppedOffline: true });
  assert.equal(calls.length, 1, "stops at the first network failure");
  assert.equal((await list("b@x.com")).length, 2);
  const up = await flush(fakeDb([null], []), "b@x.com");
  assert.equal(up.synced, 2);
});

test("a rejected change is parked as failed, not retried automatically, and others continue", async () => {
  await enqueue({ ...base, owner: "c@x.com", table: "scores", rows: [{ n: 1 }] });
  await enqueue({ ...base, owner: "c@x.com", table: "scores", rows: [{ n: 2 }] });
  const calls: Call[] = [];
  const r = await flush(fakeDb([{ code: "42501", message: "denied" }, null], calls), "c@x.com");
  assert.deepEqual(r, { synced: 1, failed: 1, stoppedOffline: false });
  const left = await list("c@x.com");
  assert.equal(left.length, 1);
  assert.equal(left[0].status, "failed");
  assert.match(left[0].error ?? "", /permission/);
  const again = await flush(fakeDb([null], []), "c@x.com");
  assert.equal(again.synced, 0, "failed entries are not replayed until retried");
  await retryFailed("c@x.com");
  assert.equal((await flush(fakeDb([null], []), "c@x.com")).synced, 1);
});

test("one user's pending work is never sent under another login", async () => {
  await enqueue({ ...base, owner: "d@x.com", table: "student_attendance", rows: [{ n: 1 }] });
  const calls: Call[] = [];
  const r = await flush(fakeDb([null], calls), "someone-else@x.com");
  assert.equal(r.synced, 0);
  assert.equal(calls.length, 0);
  assert.equal((await list("d@x.com")).length, 1);
});

test("only attendance and scores can be queued, with sane sizes", async () => {
  await assert.rejects(() => enqueue({ ...base, owner: "e@x.com", table: "payments" as never, rows: [{}] }), /cannot be queued/);
  await assert.rejects(() => enqueue({ ...base, owner: "e@x.com", table: "scores", rows: [] }), /between 1 and 500/);
});

test("detects network failures from the Supabase client", () => {
  assert.equal(isNetworkError({ message: "TypeError: Failed to fetch" }), true);
  assert.equal(isNetworkError({ message: "Load failed" }), true);
  assert.equal(isNetworkError({ message: "new row violates row-level security policy", code: "42501" }), false);
  assert.equal(isNetworkError(null), false);
});
