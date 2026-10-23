import { Suspense } from "react";
import SchoolModuleFrame from "@/components/dashboard/SchoolModuleFrame";
import { getSchoolModuleContext } from "@/lib/permissions/getSchoolModuleContext";
import TimetableManager from "@/features/timetable/TimetableManager";

type Props = { params: Promise<{ slug: string }> };
export default function Page({ params }: Props) {
  return <Suspense fallback={<main className="p-8">Loading timetable...</main>}><Content params={params} /></Suspense>;
}
async function Content({ params }: Props) {
  const { slug } = await params;
  const context = await getSchoolModuleContext(slug, "timetable.read");
  return (
    <SchoolModuleFrame school={context.school} userEmail={context.user.email ?? "Authenticated User"}
      roles={context.roles.map((role) => role.name)} permissions={context.permissions}
      title="Timetable" subtitle="Weekly lessons by class or teacher, with clash detection for teachers and rooms.">
      <TimetableManager schoolId={context.school.id} canManage={context.permissions.has("timetable.manage")} />
    </SchoolModuleFrame>
  );
}
