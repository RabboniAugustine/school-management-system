"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveHomePath } from "@/lib/auth/resolveHome";

/** Sends an already signed-in visitor straight to their dashboard. Renders nothing. */
export default function AuthRedirect() {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const db = createClient();
        const { data } = await db.auth.getUser();
        if (!active || !data.user) return;
        router.replace(await resolveHomePath(db));
      } catch { /* stay on the landing page */ }
    })();
    return () => { active = false; };
  }, [router]);
  return null;
}
