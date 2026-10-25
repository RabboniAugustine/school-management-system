import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Decides where a signed-in user should land:
 *  - exactly one active school  -> that school's dashboard (role-based navigation is built there)
 *  - several schools or none    -> /select-school (it lists schools, or offers to register one)
 *  - not signed in              -> /login
 *
 * This only chooses a destination. The destination pages verify access again on the server.
 */
export async function resolveHomePath(db: SupabaseClient): Promise<string> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return "/login";

  const memberships = await db
    .from("school_memberships")
    .select("school_id")
    .eq("user_id", auth.user.id)
    .eq("status", "active");
  if (memberships.error) return "/select-school";

  const ids = [...new Set((memberships.data ?? []).map((m: { school_id: string }) => m.school_id))];
  if (ids.length === 0) return "/select-school";

  const schools = await db.from("schools").select("id,slug,status").in("id", ids).eq("status", "active");
  if (schools.error) return "/select-school";

  const usable = (schools.data ?? []) as { id: string; slug: string }[];
  if (usable.length === 1) return `/schools/${encodeURIComponent(usable[0].slug)}/dashboard`;
  return "/select-school";
}
