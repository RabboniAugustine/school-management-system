import { notFound } from "next/navigation";
import { requireSchoolAccess } from "@/lib/permissions/requireSchoolAccess";
import { getSchoolPermissions } from "@/lib/permissions/getSchoolPermissions";

export async function getSchoolModuleContext(slug: string, requiredPermission: string) {
  const context = await requireSchoolAccess(slug);
  const permissions = await getSchoolPermissions(
    context.supabase,
    context.roles.map((role) => role.id)
  );
  if (!permissions.has(requiredPermission)) notFound();
  return { ...context, permissions };
}
