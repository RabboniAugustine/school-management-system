"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearOfflineCaches } from "@/components/offline/OfflineStatus";

export default function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await createClient().auth.signOut();
      await clearOfflineCaches();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button type="button" onClick={signOut} disabled={busy}
      className={className ?? "rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
