import { Suspense } from "react";
import SchoolModuleFrame from "@/components/dashboard/SchoolModuleFrame";
import { getSchoolModuleContext } from "@/lib/permissions/getSchoolModuleContext";
import FeesManager from "@/features/fees/FeesManager";

type Props = { params: Promise<{ slug: string }> };
export default function Page({ params }: Props) {
  return <Suspense fallback={<main className="p-8">Loading fees...</main>}><Content params={params} /></Suspense>;
}
async function Content({ params }: Props) {
  const { slug } = await params;
  const context = await getSchoolModuleContext(slug, "fees.read");
  return (
    <SchoolModuleFrame school={context.school} userEmail={context.user.email ?? "Authenticated User"}
      roles={context.roles.map((role) => role.name)} permissions={context.permissions}
      title="Fees & Finance" subtitle="Fee structure, invoices, payments, receipts, arrears and expenses.">
      <FeesManager schoolId={context.school.id} schoolName={context.school.name} canManage={context.permissions.has("fees.manage")} />
    </SchoolModuleFrame>
  );
}
