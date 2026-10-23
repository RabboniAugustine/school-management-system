import { Suspense } from "react";
import { notFound } from "next/navigation";
import SchoolModuleFrame from "@/components/dashboard/SchoolModuleFrame";
import { requireSchoolAccess } from "@/lib/permissions/requireSchoolAccess";
import { getSchoolPermissions } from "@/lib/permissions/getSchoolPermissions";
import HRManager from "@/features/hr/HRManager";

type Props = { params: Promise<{ slug: string }> };
export default function Page({ params }: Props) {
  return <Suspense fallback={<main className="p-8">Loading HR...</main>}><Content params={params} /></Suspense>;
}
async function Content({ params }: Props) {
  const { slug } = await params;
  const context = await requireSchoolAccess(slug);
  const permissions = await getSchoolPermissions(context.supabase, context.roles.map((role) => role.id));
  const canLeave = permissions.has("hr.read") || permissions.has("leave.request");
  const canPayroll = permissions.has("payroll.read");
  if (!canLeave && !canPayroll) notFound();
  return (
    <SchoolModuleFrame school={context.school} userEmail={context.user.email ?? "Authenticated User"}
      roles={context.roles.map((role) => role.name)} permissions={permissions}
      title="HR & Payroll" subtitle="Staff leave, pay setup, monthly payroll runs and payslips.">
      <HRManager schoolId={context.school.id} schoolName={context.school.name} canLeave={canLeave} canManageLeave={permissions.has("hr.manage")}
        canPayroll={canPayroll} canManagePayroll={permissions.has("payroll.manage")} />
    </SchoolModuleFrame>
  );
}
