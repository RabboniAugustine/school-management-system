import { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/** Resolve current school's effective permissions from already verified, school-scoped role IDs. */
export async function getSchoolPermissions(
  supabase: ServerSupabase,
  roleIds: string[]
): Promise<Set<string>> {
  if (roleIds.length === 0) return new Set();
  const { data: grants, error: grantError } = await supabase
    .from("role_permissions")
    .select("permission_id")
    .in("role_id", roleIds);
  if (grantError) throw new Error("Unable to verify school permissions.");
  const ids = [...new Set((grants ?? []).map((row) => row.permission_id))];
  if (ids.length === 0) return new Set();
  const { data: permissions, error } = await supabase
    .from("permissions")
    .select("code")
    .in("id", ids);
  if (error) throw new Error("Unable to verify school permissions.");
  return new Set((permissions ?? []).map((permission) => permission.code));
}
