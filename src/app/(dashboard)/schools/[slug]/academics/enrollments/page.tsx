import { Suspense } from "react";
import SchoolModuleFrame from "@/components/dashboard/SchoolModuleFrame";
import { getSchoolModuleContext } from "@/lib/permissions/getSchoolModuleContext";
import EnrollmentManager from "@/features/enrollments/EnrollmentManager";

type Props = { params: Promise<{ slug: string }> };
export default function Page({params}: Props) {
  return <Suspense fallback={<main className="p-8">Loading student enrollments...</main>}><Content params={params} /></Suspense>;
}
async function Content({params}: Props) {
  const {slug} = await params;
  const context = await getSchoolModuleContext(slug, "enrollments.read");
  return (
    <SchoolModuleFrame school={context.school} userEmail={context.user.email ?? "Authenticated User"}
      roles={context.roles.map((role) => role.name)} permissions={context.permissions}
      title="Student Enrollments" subtitle="Assign students to academic years, classes and streams.">
      <EnrollmentManager schoolId={context.school.id} canManage={context.permissions.has("enrollments.manage")} />
    </SchoolModuleFrame>
  );
}
