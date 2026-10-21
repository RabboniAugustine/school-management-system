import { Suspense } from "react";
import SchoolModuleFrame from "@/components/dashboard/SchoolModuleFrame";
import { getSchoolModuleContext } from "@/lib/permissions/getSchoolModuleContext";
import ClassStreamManager from "@/features/classes/ClassStreamManager";

type Props = { params: Promise<{ slug: string }> };
export default function Page({params}: Props) {
  return <Suspense fallback={<main className="p-8">Loading classes & streams...</main>}><Content params={params} /></Suspense>;
}
async function Content({params}: Props) {
  const {slug} = await params;
  const context = await getSchoolModuleContext(slug, "classes.read");
  return (
    <SchoolModuleFrame school={context.school} userEmail={context.user.email ?? "Authenticated User"}
      roles={context.roles.map((role) => role.name)} permissions={context.permissions}
      title="Classes & Streams" subtitle="Create school classes and organize their streams.">
      <ClassStreamManager schoolId={context.school.id} canManage={context.permissions.has("classes.manage")} />
    </SchoolModuleFrame>
  );
}
