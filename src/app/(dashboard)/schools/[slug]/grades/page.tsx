import { Suspense } from "react";
import SchoolModuleFrame from "@/components/dashboard/SchoolModuleFrame";
import { getSchoolModuleContext } from "@/lib/permissions/getSchoolModuleContext";
import GradesManager from "@/features/grades/GradesManager";

type Props = { params: Promise<{ slug: string }> };
export default function Page({ params }: Props) {
  return <Suspense fallback={<main className="p-8">Loading grades...</main>}><Content params={params} /></Suspense>;
}
async function Content({ params }: Props) {
  const { slug } = await params;
  const context = await getSchoolModuleContext(slug, "grades.read");
  return (
    <SchoolModuleFrame school={context.school} userEmail={context.user.email ?? "Authenticated User"}
      roles={context.roles.map((role) => role.name)} permissions={context.permissions}
      title="Grades & Report Cards" subtitle="Assessments, score entry, grading scale, rankings and terminal reports.">
      <GradesManager schoolId={context.school.id} schoolName={context.school.name} canManage={context.permissions.has("grades.manage")} />
    </SchoolModuleFrame>
  );
}
