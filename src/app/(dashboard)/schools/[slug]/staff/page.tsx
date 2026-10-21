import { Suspense } from "react";
import SchoolModuleFrame from "@/components/dashboard/SchoolModuleFrame";
import { getSchoolModuleContext } from "@/lib/permissions/getSchoolModuleContext";
import StaffManager from "@/features/staff/StaffManager";

type Props = { params: Promise<{ slug: string }> };
export default function Page({params}: Props) {
  return <Suspense fallback={<main className="p-8">Loading staff & teachers...</main>}><Content params={params} /></Suspense>;
}
async function Content({params}: Props) {
  const {slug} = await params;
  const context = await getSchoolModuleContext(slug, "staff.read");
  return (
    <SchoolModuleFrame school={context.school} userEmail={context.user.email ?? "Authenticated User"}
      roles={context.roles.map((role) => role.name)} permissions={context.permissions}
      title="Staff & Teachers" subtitle="Register school staff and manage their status.">
      <StaffManager schoolId={context.school.id} canManage={context.permissions.has("staff.manage")} />
    </SchoolModuleFrame>
  );
}
