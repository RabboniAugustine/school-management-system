import { Suspense } from "react";
import SchoolModuleFrame from "@/components/dashboard/SchoolModuleFrame";
import { getSchoolModuleContext } from "@/lib/permissions/getSchoolModuleContext";
import HostelManager from "@/features/hostel/HostelManager";

type Props = { params: Promise<{ slug: string }> };
export default function Page({ params }: Props) {
  return <Suspense fallback={<main className="p-8">Loading hostel...</main>}><Content params={params} /></Suspense>;
}
async function Content({ params }: Props) {
  const { slug } = await params;
  const context = await getSchoolModuleContext(slug, "hostel.read");
  return (
    <SchoolModuleFrame school={context.school} userEmail={context.user.email ?? "Authenticated User"}
      roles={context.roles.map((role) => role.name)} permissions={context.permissions}
      title="Hostel" subtitle="Hostels, rooms and bed allocations.">
      <HostelManager schoolId={context.school.id} canManage={context.permissions.has("hostel.manage")} />
    </SchoolModuleFrame>
  );
}
