import { Suspense } from "react";
import SchoolModuleFrame from "@/components/dashboard/SchoolModuleFrame";
import { getSchoolModuleContext } from "@/lib/permissions/getSchoolModuleContext";
import AcademicYearsWorkspace from "@/features/academics/AcademicYearsWorkspace";

type Props = { params: Promise<{ slug: string }> };
export default function Page({params}: Props) {
  return <Suspense fallback={<main className="p-8">Loading academic years & terms...</main>}><Content params={params} /></Suspense>;
}
async function Content({params}: Props) {
  const {slug} = await params;
  const context = await getSchoolModuleContext(slug, "academics.read");
  return (
    <SchoolModuleFrame school={context.school} userEmail={context.user.email ?? "Authenticated User"}
      roles={context.roles.map((role) => role.name)} permissions={context.permissions}
      title="Academic Years & Terms" subtitle="Manage and activate school academic calendars.">
      <AcademicYearsWorkspace schoolId={context.school.id} canManage={context.permissions.has("academics.manage")} />
    </SchoolModuleFrame>
  );
}
