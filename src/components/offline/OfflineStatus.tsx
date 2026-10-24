"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { flush, list, remove, retryFailed, type Mutation } from "@/lib/offlineQueue";

const OWNER_KEY = "sms-offline-owner";

/** Deletes cached pages and data held by the service worker (call on sign-out). */
export async function clearOfflineCaches(): Promise<void> {
  if (typeof caches !== "undefined") await Promise.all(["sms-pages-v1", "sms-data-v1"].map((k) => caches.delete(k)));
  const reg = typeof navigator !== "undefined" && "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  reg?.active?.postMessage({ type: "clear" });
}

/**
 * Registers the service worker, shows connection / pending-sync status, and replays queued changes
 * when the device comes back online. `owner` is the signed-in user's email.
 */
export default function OfflineStatus({ owner }: { owner: string }) {
  const db = useMemo(() => createClient(), []);
  const [online, setOnline] = useState(true);
  const [items, setItems] = useState<Mutation[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => { try { setItems(await list(owner)); } catch { setItems([]); } }, [owner]);

  const sync = useCallback(async () => {
    setSyncing(true); setMessage("");
    try {
      const r = await flush(db, owner);
      if (r.synced) setMessage(`${r.synced} saved change${r.synced === 1 ? "" : "s"} sent to the server.`);
      window.dispatchEvent(new CustomEvent("sms-offline-synced"));
    } finally { setSyncing(false); await refresh(); }
  }, [db, owner, refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOnline(navigator.onLine);
      // A different person on this device must never see the previous user's cached data.
      void (async () => {
        if (localStorage.getItem(OWNER_KEY) !== owner) { await clearOfflineCaches(); localStorage.setItem(OWNER_KEY, owner); }
        if ("serviceWorker" in navigator && process.env.NEXT_PUBLIC_SUPABASE_URL) {
          const sb = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host;
          await navigator.serviceWorker.register(`/sw.js?sb=${encodeURIComponent(sb)}`, { scope: "/" }).catch(() => undefined);
        }
        await refresh();
        if (navigator.onLine) await sync();
      })();
    }, 0);
    const up = () => { setOnline(true); void sync(); };
    const down = () => setOnline(false);
    const changed = () => { void refresh(); };
    window.addEventListener("online", up); window.addEventListener("offline", down); window.addEventListener("sms-offline-queued", changed);
    return () => { window.clearTimeout(timer); window.removeEventListener("online", up); window.removeEventListener("offline", down); window.removeEventListener("sms-offline-queued", changed); };
  }, [owner, refresh, sync]);

  const pending = items.filter((m) => m.status === "pending");
  const failed = items.filter((m) => m.status === "failed");
  if (online && items.length === 0 && !message) return null;

  return (
    <div role="status" className={`mb-4 rounded-xl border px-4 py-3 text-sm ${!online ? "border-amber-300 bg-amber-50 text-amber-900" : failed.length ? "border-red-200 bg-red-50 text-red-800" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
      {!online && <p><b>You are offline.</b> Attendance and scores you save are kept on this device and sent automatically when you reconnect.</p>}
      {pending.length > 0 && <p>{pending.length} change{pending.length === 1 ? "" : "s"} waiting to sync{online && !syncing ? "." : syncing ? "…" : "."} {online && !syncing && <button className="font-semibold underline" onClick={() => void sync()}>Sync now</button>}</p>}
      {message && <p>{message}</p>}
      {failed.length > 0 && <div className="mt-1"><p><b>{failed.length} change{failed.length === 1 ? " was" : "s were"} rejected by the server</b> and not saved:</p>
        <ul className="ml-4 list-disc">{failed.map((m) => <li key={m.id}>{m.label}: {m.error} <button className="underline" onClick={() => void remove(m.id).then(refresh)}>Discard</button></li>)}</ul>
        <button className="mt-1 font-semibold underline" onClick={() => void retryFailed(owner).then(sync)}>Retry</button></div>}
    </div>
  );
}
