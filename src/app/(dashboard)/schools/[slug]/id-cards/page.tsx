import { Suspense } from "react";
import SchoolModuleFrame from "@/components/dashboard/SchoolModuleFrame";
import { getSchoolModuleContext } from "@/lib/permissions/getSchoolModuleContext";
import IdCardsManager from "@/features/idcards/IdCardsManager";

type Props = { params: Promise<{ slug: string }> };
export default function Page({ params }: Props) {
  return <Suspense fallback={<main className="p-8">Loading ID cards...</main>}><Content params={params} /></Suspense>;
}
async function Content({ params }: Props) {
  const { slug } = await params;
  const context = await getSchoolModuleContext(slug, "students.read");
  return (
    <SchoolModuleFrame school={context.school} userEmail={context.user.email ?? "Authenticated User"}
      roles={context.roles.map((role) => role.name)} permissions={context.permissions}
      title="ID cards" subtitle="Print student and staff ID cards with QR codes.">
      <IdCardsManager schoolId={context.school.id} schoolName={context.school.name} canStaff={context.permissions.has("staff.read")} />
    </SchoolModuleFrame>
  );
}
