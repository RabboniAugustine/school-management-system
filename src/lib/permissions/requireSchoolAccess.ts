import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireSchoolAccess(slug: string) {
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  if (
    slug.length < 3 ||
    slug.length > 80 ||
    !slugPattern.test(slug)
  ) {
    notFound();
  }

  const supabase = await createClient();

  // Verify authenticated user
  const {
    data: authData,
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    redirect("/login");
  }

  const user = authData.user;

  // Retrieve school through RLS
  const {
    data: school,
    error: schoolError,
  } = await supabase
    .from("schools")
    .select("id, name, slug, status")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (schoolError) {
    throw new Error("Unable to verify school access.");
  }

  if (!school) {
    notFound();
  }

  // Verify active membership
  const {
    data: membership,
    error: membershipError,
  } = await supabase
    .from("school_memberships")
    .select("id, school_id, status")
    .eq("school_id", school.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) {
    throw new Error("Unable to verify school membership.");
  }

  if (!membership) {
    notFound();
  }

  // Retrieve assigned roles
  const {
    data: assignments,
    error: assignmentsError,
  } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("school_id", school.id)
    .eq("membership_id", membership.id);

  if (assignmentsError) {
    throw new Error("Unable to verify user roles.");
  }

  if (!assignments?.length) {
    notFound();
  }

  const roleIds = assignments.map(
    (assignment) => assignment.role_id
  );

  const {
    data: roles,
    error: rolesError,
  } = await supabase
    .from("roles")
    .select("id, code, name")
    .in("id", roleIds);

  if (rolesError) {
    throw new Error("Unable to retrieve school roles.");
  }

  if (!roles?.length) {
    notFound();
  }

  return {
    supabase,
    user,
    school,
    membership,
    roles,
  };
}